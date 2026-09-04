// src/services/waitlist/waitlist-service.ts
import { generateSessionToken, sha256Base64Url } from "@/lib/auth/crypto";
import { csvRow } from "@/lib/csv/escape";
import type { RateLimiter } from "@/lib/security/rate-limit";
import { authorize, type Viewer } from "@/domain/product/permissions";
import { parseWaitlistSignup } from "@/domain/waitlist/signup";
import type { ProductRepository } from "@/repositories/product-repository";
import {
  WAITLIST_EXPORT_PAGE_SIZE,
  type WaitlistRepository,
} from "@/repositories/waitlist-repository";
import { RATE_LIMITS } from "@/services/security/rate-limit";

/**
 * Waitlist use cases (Phase 4 slices 4.1 and 4.2).
 *
 * Every mutation follows the order `AGENTS.md` §7 requires:
 * parse → validate → authenticate → authorize → rate-limit → domain → persist
 * → safe response. Repositories, the limiter, the clock, and the mail dispatch
 * are all injected, so these run against a test database with no framework
 * anywhere near them.
 */

export type WaitlistServiceError =
  | "INVALID_EMAIL"
  | "CONSENT_REQUIRED"
  | "PRODUCT_NOT_FOUND"
  | "RATE_LIMITED"
  | "NOT_FOUND";

export class WaitlistError extends Error {
  constructor(
    readonly code: WaitlistServiceError,
    /** Epoch milliseconds, when the code is RATE_LIMITED. */
    readonly resetAt?: number
  ) {
    super(code);
    this.name = "WaitlistError";
  }
}

/**
 * A confirmation link's secret.
 *
 * `generateSessionToken` is a 32-byte CSPRNG value in base64url; the name says
 * "session" because that was its first caller, not because it is session-
 * specific. It is used here for the property that matters — unguessable — and
 * only its SHA-256 reaches the table.
 */
function newConfirmationToken(): string {
  return generateSessionToken();
}

/** What a confirmation email needs to know. Composed by the caller. */
export type WaitlistConfirmationMessage = {
  readonly email: string;
  readonly productName: string;
  readonly productSlug: string;
  /** The raw token. Only ever held in memory and in the outgoing mail. */
  readonly token: string;
};

export type SendWaitlistConfirmation = (
  message: WaitlistConfirmationMessage
) => Promise<void>;

/**
 * How the confirmation email gets sent relative to the response.
 *
 * `docs/ENGINEERING.md` §9: **never block the main request on non-critical
 * email delivery**. A visitor who has just been told "check your inbox" should
 * not be watching a spinner while an HTTP call to a third party times out, and
 * a provider outage must not turn a successful signup into an error page.
 *
 * There is no queue here and there will not be one — `CLAUDE.md` §7 puts queues
 * at Stage 2, and nothing has measured a need. So the seam is a function
 * instead: the application passes Next's `after()`, which runs the work once
 * the response has been sent, and a test passes something it can await. Two
 * real implementations, which is what keeps this from being the
 * single-implementation abstraction `AGENTS.md` §6 rejects.
 *
 * The default runs it immediately and swallows the failure, so a caller that
 * forgets to pass one is still safe — just slower.
 */
export type DispatchConfirmation = (send: () => Promise<void>) => void;

const dispatchImmediately: DispatchConfirmation = (send) => {
  // The rejection is swallowed rather than propagated, deliberately. The
  // subscriber's request has already succeeded and there is nothing to tell
  // them: the row exists, and a confirmation they never receive is a signup
  // that stays unconfirmed, which is the correct outcome for an address that
  // could not be reached.
  void send().catch(() => {});
};

export type JoinWaitlistOutcome = {
  /** Always true for a request that got this far. See the note below. */
  readonly accepted: true;
  readonly productSlug: string;
};

/**
 * Joins a product's waitlist.
 *
 * Three things here are load-bearing and easy to get subtly wrong.
 *
 * **Consent is validated before anything else touches the database.** It is not
 * a form nicety: `docs/LEGAL.md` §5 files a waitlist entry as consent-based, so
 * an entry stored without a consent record is an address the site may not write
 * to, sitting in a table whose entire purpose is writing to addresses.
 *
 * **The product is re-loaded through the joinable predicate.** A `productId` in
 * a form body is an assertion by the caller. `findJoinableProduct` applies both
 * public visibility and the owner's switch as SQL filters, so a draft listing
 * and a listing whose owner turned the waitlist off both have nowhere to join.
 *
 * **The answer is the same whether this was a new signup, a repeat, or an
 * address that had already confirmed.** Telling a visitor "you are already on
 * this list" turns the form into an oracle for whether a given person
 * subscribed to a given product, which is exactly the disclosure the consent
 * record exists to protect.
 */
export async function joinWaitlist(input: {
  repository: WaitlistRepository;
  rateLimiter: RateLimiter;
  productId: string;
  email: unknown;
  consent: unknown;
  /** Undefined when the header is absent. The per-IP limit is then skipped. */
  ipAddress?: string;
  sendConfirmation: SendWaitlistConfirmation;
  dispatch?: DispatchConfirmation;
  now?: () => Date;
  /** Injected so a test can pin the token instead of reading it out of mail. */
  generateToken?: () => string;
}): Promise<JoinWaitlistOutcome> {
  const parsed = parseWaitlistSignup({
    email: input.email,
    consent: input.consent,
  });
  if (!parsed.ok) throw new WaitlistError(parsed.reason);

  const product = await input.repository.findJoinableProduct(input.productId);
  if (!product) throw new WaitlistError("PRODUCT_NOT_FOUND");

  // Per address and per sender, the pair `docs/SECURITY.md` §11 uses for
  // sign-in and for the same reason: one bounds how often a mailbox can be
  // mailed, the other bounds how many mailboxes one machine can reach.
  const decisions = await Promise.all([
    input.rateLimiter.consume(
      RATE_LIMITS.waitlistJoinEmail,
      parsed.signup.email
    ),
    input.ipAddress
      ? input.rateLimiter.consume(RATE_LIMITS.waitlistJoinIp, input.ipAddress)
      : Promise.resolve(null),
  ]);

  const refused = decisions.find((decision) => decision && !decision.allowed);
  if (refused) throw new WaitlistError("RATE_LIMITED", refused.resetAt);

  const now = (input.now ?? (() => new Date()))();
  const token = (input.generateToken ?? newConfirmationToken)();

  const written = await input.repository.upsertPendingEntry({
    productId: product.id,
    email: parsed.signup.email,
    consentedAt: now,
    consentStatement: parsed.signup.consentStatement,
    confirmationTokenHash: await sha256Base64Url(token),
  });

  // An address that has already confirmed gets no second email. Sending one
  // would let anybody who knows an address use this form to mail it, which is
  // the abuse the double opt-in exists to prevent.
  if (!written.alreadyConfirmed) {
    const dispatch = input.dispatch ?? dispatchImmediately;

    dispatch(() =>
      input.sendConfirmation({
        email: parsed.signup.email,
        productName: product.name,
        productSlug: product.slug,
        token,
      })
    );
  }

  return { accepted: true, productSlug: product.slug };
}

export type ConfirmOutcome =
  | {
      readonly kind: "confirmed" | "already";
      readonly productSlug: string;
      readonly productName: string;
    }
  | { readonly kind: "unknown" };

/**
 * Completes a double opt-in (ADR-029).
 *
 * The token proves control of the mailbox, which is the whole mechanism: the
 * address becomes mailable because somebody holding it acted, not because
 * somebody typed it into a form.
 *
 * A link followed twice confirms once. The update is guarded on the status, so
 * the second call matches no row — and that is reported as `already` rather
 * than as an error, because to the person clicking it the outcome is identical
 * and an error page would read as a broken confirmation. Mail clients prefetch
 * links; this is not a rare case.
 */
export async function confirmWaitlistEntry(input: {
  repository: WaitlistRepository;
  token: unknown;
  now?: () => Date;
}): Promise<ConfirmOutcome> {
  if (typeof input.token !== "string" || input.token.length === 0) {
    return { kind: "unknown" };
  }

  const tokenHash = await sha256Base64Url(input.token);

  const now = (input.now ?? (() => new Date()))();
  const confirmed = await input.repository.confirmEntry(tokenHash, now);

  if (confirmed) {
    // Re-read for the product's name and slug. The token is gone from the row
    // by now, so this looks the entry up by its id.
    const product = await input.repository.findProductForEntry(confirmed.id);
    if (!product) return { kind: "unknown" };

    return {
      kind: "confirmed",
      productSlug: product.slug,
      productName: product.name,
    };
  }

  // Nothing was updated: either the token is unknown, or it belongs to an
  // entry that is already confirmed. Only the second has a page worth showing.
  const existing = await input.repository.findByConfirmationToken(tokenHash);
  if (!existing) return { kind: "unknown" };

  return {
    kind: "already",
    productSlug: existing.productSlug,
    productName: existing.productName,
  };
}

/**
 * Erases an entry at its subscriber's request (`docs/LEGAL.md` §5).
 *
 * A delete, not a status. The retention table holds a waitlist entry "until
 * product deletion or unsubscribe", and a row marked unsubscribed is personal
 * data that has not been erased — which the same section names as a finding.
 *
 * The answer does not distinguish "removed" from "there was nothing there". A
 * removal endpoint that did would tell a stranger holding a guessed token
 * whether an address is on a list, and there is nothing a subscriber can do
 * differently with the distinction.
 */
export async function unsubscribeFromWaitlist(input: {
  repository: WaitlistRepository;
  token: unknown;
}): Promise<void> {
  if (typeof input.token !== "string" || input.token.length === 0) return;

  await input.repository.deleteByConfirmationToken(
    await sha256Base64Url(input.token)
  );
}

/** The header row, named once so the export and its tests cannot disagree. */
export const WAITLIST_CSV_COLUMNS = [
  "email",
  "consented_at",
  "consent_statement",
  "confirmed_at",
] as const;

export type WaitlistExport = {
  readonly productSlug: string;
  readonly productName: string;
  /** Emits the header row, then one row per confirmed entry. */
  rows(): AsyncGenerator<string>;
};

/**
 * A product's confirmed waitlist, as CSV.
 *
 * **Authorization first, and from the session.** The product is re-loaded
 * server-side and checked with the `export_waitlist` verb — its own verb, so
 * that granting somebody the right to edit a listing does not also grant them a
 * list of strangers' email addresses. Nothing here reads an owner id from the
 * request (`AGENTS.md` §7).
 *
 * The authorization and the rate limit run when this function is **awaited**,
 * and the rows stream from the generator it returns. That split is deliberate:
 * an async generator's body does not run until something pulls from it, so
 * putting the access check inside one would mean a caller could build a 200
 * response and only discover the refusal midway through the body.
 *
 * **Streamed, not assembled.** `docs/ENGINEERING.md` §7 and a metered CPU
 * budget: building the whole file in memory makes both response time and memory
 * scale with the list, and the product that eventually has fifty thousand
 * subscribers is the one whose founder most wants this. At most
 * `WAITLIST_EXPORT_PAGE_SIZE` rows exist at once.
 *
 * The row count reaches `onComplete` at the end rather than being counted up
 * front, because counting first would be a second full scan of the same rows
 * and the number is only wanted for the audit record.
 */
export async function exportWaitlistCsv(input: {
  repository: WaitlistRepository;
  products: ProductRepository;
  rateLimiter: RateLimiter;
  viewer: Viewer;
  productId: string;
  onComplete?: (summary: { rowCount: number }) => Promise<void> | void;
}): Promise<WaitlistExport> {
  const product = await input.products.findForAuthorization(input.productId);
  if (!product) throw new WaitlistError("NOT_FOUND");

  try {
    authorize(input.viewer, "export_waitlist", product);
  } catch {
    // Rethrown as NOT_FOUND on purpose, and it is the same answer an unknown
    // id gets. An authorization failure that is distinguishable from a missing
    // record turns this endpoint into a way to enumerate which product ids
    // exist (`docs/SECURITY.md` §3).
    throw new WaitlistError("NOT_FOUND");
  }

  // `authorize` has already established the viewer is the owner, so this is
  // non-null — asserted by a check rather than a `!`, because a future edit to
  // the permission rule should fail here rather than write `undefined` into an
  // audit row.
  const actorId = input.viewer.userId;
  if (!actorId) throw new WaitlistError("NOT_FOUND");

  // After authorization, so a stranger guessing ids cannot spend a real
  // owner's allowance, and before the first read, so the limit is enforced by
  // refusing work rather than by counting work already done.
  const decision = await input.rateLimiter.consume(
    RATE_LIMITS.waitlistExport,
    actorId
  );
  if (!decision.allowed) {
    throw new WaitlistError("RATE_LIMITED", decision.resetAt);
  }

  const repository = input.repository;
  const onComplete = input.onComplete;
  const exportedProductId = product.id;

  async function* rows(): AsyncGenerator<string> {
    yield csvRow(WAITLIST_CSV_COLUMNS);

    let after: { createdAt: Date; id: string } | null = null;
    let rowCount = 0;

    for (;;) {
      const page = await repository.listConfirmedForExport(exportedProductId, {
        limit: WAITLIST_EXPORT_PAGE_SIZE,
        after,
      });
      if (page.length === 0) break;

      for (const entry of page) {
        // Every field goes through the same serialiser, timestamps included.
        // Not because an ISO date can contain a comma, but because a serialiser
        // applied selectively is one that somebody later extends with a column
        // they forget to escape.
        yield csvRow([
          entry.email,
          entry.consentedAt.toISOString(),
          entry.consentStatement,
          entry.confirmedAt?.toISOString() ?? null,
        ]);
        rowCount += 1;
      }

      const last = page[page.length - 1]!;
      after = { createdAt: last.createdAt, id: last.id };

      if (page.length < WAITLIST_EXPORT_PAGE_SIZE) break;
    }

    await onComplete?.({ rowCount });
  }

  return { productSlug: product.slug, productName: product.name, rows };
}
