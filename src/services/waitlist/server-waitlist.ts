// src/services/waitlist/server-waitlist.ts
import { after } from "next/server";

import { getDb } from "@/db";
import { ProductRepository } from "@/repositories/product-repository";
import { RateLimitRepository } from "@/repositories/rate-limit-repository";
import { WaitlistRepository } from "@/repositories/waitlist-repository";
import { DatabaseRateLimiter } from "@/services/security/rate-limit";
import { sendWaitlistConfirmation } from "@/services/waitlist/email-delivery";
import {
  confirmWaitlistEntry as confirmWaitlistEntryUseCase,
  exportWaitlistCsv as exportWaitlistCsvUseCase,
  joinWaitlist as joinWaitlistUseCase,
  unsubscribeFromWaitlist as unsubscribeFromWaitlistUseCase,
} from "@/services/waitlist/waitlist-service";

/**
 * The server-side binding for the waitlist use cases.
 *
 * Pages, Server Actions, and the export route call these; the use cases stay
 * free of `getDb` and of anything Next-specific, so tests supply their own
 * database. Mirrors `src/services/comment/server-comment.ts`.
 */

function repository() {
  return new WaitlistRepository(getDb());
}

function rateLimiter() {
  return new DatabaseRateLimiter(new RateLimitRepository(getDb()));
}

type Without<T> = Omit<
  T,
  | "repository"
  | "products"
  | "rateLimiter"
  | "sendConfirmation"
  | "dispatch"
  // Supplied here, not by the caller: the audit record is a requirement of the
  // endpoint, not an option a call site may decline.
  | "onComplete"
>;

/**
 * Joins a waitlist, and sends the confirmation **after** the response.
 *
 * This is where `docs/ENGINEERING.md` §9 — "never block the main request on
 * non-critical email delivery" — is actually satisfied. `after()` is Next's own
 * mechanism for work that should run once the response has been sent; it needs
 * no queue, no background worker, and no Stage 2 infrastructure (`CLAUDE.md`
 * §7). The visitor sees "check your inbox" at the speed of a database write,
 * and a ZeptoMail outage cannot turn their signup into an error page.
 *
 * The rejection is swallowed inside the callback rather than left to float,
 * because an unhandled rejection in `after()` is a crashed task with no user to
 * report it to. The consequence of a failed send is already correct without any
 * handling: the entry stays PENDING, so nothing is ever mailed to an address
 * that was never confirmed.
 */
export function joinWaitlist(
  input: Without<Parameters<typeof joinWaitlistUseCase>[0]>
) {
  return joinWaitlistUseCase({
    ...input,
    repository: repository(),
    rateLimiter: rateLimiter(),
    sendConfirmation: sendWaitlistConfirmation,
    dispatch: (send) => {
      after(async () => {
        try {
          await send();
        } catch {
          // Deliberately silent. See above.
        }
      });
    },
  });
}

export function confirmWaitlistEntry(
  input: Without<Parameters<typeof confirmWaitlistEntryUseCase>[0]>
) {
  return confirmWaitlistEntryUseCase({ ...input, repository: repository() });
}

export function unsubscribeFromWaitlist(
  input: Without<Parameters<typeof unsubscribeFromWaitlistUseCase>[0]>
) {
  return unsubscribeFromWaitlistUseCase({ ...input, repository: repository() });
}

/**
 * The export, with the audit record wired in.
 *
 * `docs/SECURITY.md` §11 requires this endpoint to be audit-logged as well as
 * rate-limited, because it is the one place in the application that hands over
 * bulk personal data in a single request. The record is written when the last
 * row has been produced, so a stream that was abandoned halfway is not filed as
 * a completed export.
 */
export function exportWaitlistCsv(
  input: Without<Parameters<typeof exportWaitlistCsvUseCase>[0]>
) {
  const waitlist = repository();

  return exportWaitlistCsvUseCase({
    ...input,
    repository: waitlist,
    products: new ProductRepository(getDb()),
    rateLimiter: rateLimiter(),
    onComplete: async ({ rowCount }) => {
      if (!input.viewer.userId) return;

      await waitlist.recordExport({
        productId: input.productId,
        actorId: input.viewer.userId,
        rowCount,
      });
    },
  });
}

/** The dashboard's subscriber count for one product. */
export function countConfirmedSubscribers(productId: string) {
  return repository().countConfirmed(productId);
}

/**
 * Confirmed subscriber counts for every listing an account owns, keyed by id.
 *
 * One query for the dashboard's whole table. Returned as a `Map` so the page
 * reads a missing product as zero without a second thought — a product with no
 * subscribers has no rows to count, and joining every listing to prove that
 * would be work spent to produce zeroes.
 */
export async function subscriberCountsByProduct(
  ownerId: string
): Promise<Map<string, number>> {
  const rows = await repository().countConfirmedByOwner(ownerId);
  return new Map(rows.map((row) => [row.productId, row.total]));
}
