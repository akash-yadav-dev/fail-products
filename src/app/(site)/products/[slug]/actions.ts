"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import type { FormActionState } from "@/lib/forms/action-state";
import { currentUser } from "@/services/auth/current-user";
import {
  CommentError,
  MAX_COMMENT_LENGTH,
} from "@/services/comment/comment-service";
import { postComment } from "@/services/comment/server-comment";
import { ModerationError } from "@/services/moderation/moderation-service";
import { fileReport } from "@/services/moderation/server-moderation";
import {
  TURNSTILE_FIELD,
  verifyTurnstile,
} from "@/services/security/turnstile";
import { WaitlistError } from "@/services/waitlist/waitlist-service";
import { joinWaitlist } from "@/services/waitlist/server-waitlist";

/**
 * Posts a comment on a product.
 *
 * The viewer comes from the session cookie, never from the form
 * (`AGENTS.md` §7). `productId` does arrive from the form, and is treated as an
 * assertion rather than a fact: the service re-loads that product through the
 * public-visibility predicate, so a hidden, draft, or removed listing has no
 * discussion to join no matter what id is posted.
 */
export async function postCommentAction(
  _previous: FormActionState | null,
  formData: FormData
): Promise<FormActionState> {
  const user = await currentUser();
  const productId = String(formData.get("productId") ?? "");

  // Before anything is written, and server-side. A token checked only in the
  // browser is a widget an attacker posts around (docs/SECURITY.md §11).
  const challenge = await verifyTurnstile(
    formData.get(TURNSTILE_FIELD),
    "comment",
    await requestIpAddress()
  );
  if (!challenge.ok) {
    return {
      ok: false,
      message:
        "The spam check did not finish. Try again — what you wrote is still here.",
    };
  }

  try {
    const posted = await postComment({
      viewer: { userId: user?.id ?? null },
      productId,
      body: formData.get("body"),
    });

    // The product page is prerendered and cached for five minutes (ADR-027),
    // so without this the author would post a comment and not see it. This is
    // the explicit invalidation docs/ARCHITECTURE.md §5 asks for, and the
    // reason the Phase 2 comment on that route called it "a Phase 3 concern
    // once comment counts appear".
    revalidatePath("/products/" + posted.productSlug);

    return { ok: true, message: "Posted." };
  } catch (error) {
    if (error instanceof CommentError) {
      return { ok: false, message: messageFor(error) };
    }
    return { ok: false, message: "Could not post that comment. Try again." };
  }
}

function messageFor(error: CommentError): string {
  switch (error.code) {
    case "NOT_SIGNED_IN":
      return "Sign in to comment.";
    case "EMPTY":
      return "Write something first.";
    case "TOO_LONG":
      return `Comments are up to ${MAX_COMMENT_LENGTH} characters. Trim it and post again.`;
    case "RATE_LIMITED":
      // A usable message, not a 500 — the Phase 3 plan asks for exactly this.
      // The wait is stated rather than left to guesswork, because "try again
      // later" from a site that has just refused you reads as a malfunction.
      return `You are posting quickly. Try again ${relativeTime(error.resetAt)}.`;
    case "PRODUCT_NOT_FOUND":
      // Deliberately the same answer for "no such product" and "that product is
      // not public": a comment form must not become a way to probe for hidden
      // or draft listings (docs/SECURITY.md §3).
      return "That listing is not open for comments.";
    default:
      return "Could not post that comment. Try again.";
  }
}

/** "in about 4 minutes", from an epoch timestamp. */
function relativeTime(resetAt: number | undefined): string {
  if (!resetAt) return "in a few minutes";

  const minutes = Math.max(1, Math.ceil((resetAt - Date.now()) / 60_000));
  return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Files an abuse report against this product or one of its comments.
 *
 * The reporter comes from the session. The target arrives from the form and is
 * re-loaded server-side, so a report cannot be filed against something the
 * caller merely named.
 */
export async function reportAction(
  _previous: FormActionState | null,
  formData: FormData
): Promise<FormActionState> {
  const user = await currentUser();

  const challenge = await verifyTurnstile(
    formData.get(TURNSTILE_FIELD),
    "report",
    await requestIpAddress()
  );
  if (!challenge.ok) {
    return {
      ok: false,
      message:
        "The spam check did not finish. Try again — what you wrote is still here.",
    };
  }

  try {
    await fileReport({
      viewer: { userId: user?.id ?? null },
      targetType: formData.get("targetType"),
      targetId: String(formData.get("targetId") ?? ""),
      reason: formData.get("reason"),
      detail: formData.get("detail"),
    });

    // Deliberately the same answer whether this was the first report or a
    // duplicate. "You already reported this" tells the reporter nothing they
    // can act on, and the predictable response to being told is a second
    // attempt from another account.
    return {
      ok: true,
      message:
        "Thanks — a moderator will look at this. Nothing is removed automatically.",
    };
  } catch (error) {
    if (error instanceof ModerationError) {
      return { ok: false, message: reportMessageFor(error) };
    }
    return { ok: false, message: "Could not send that report. Try again." };
  }
}

function reportMessageFor(error: ModerationError): string {
  switch (error.code) {
    case "NOT_SIGNED_IN":
      return "Sign in to report something.";
    case "INVALID_REASON":
      return "Choose one of the reasons listed.";
    case "DETAIL_REQUIRED":
      return "Say what is wrong — \"something else\" needs a sentence.";
    case "RATE_LIMITED":
      return `You have sent a lot of reports. Try again ${relativeTime(error.resetAt)}.`;
    case "TARGET_NOT_FOUND":
      return "That is no longer here.";
    default:
      return "Could not send that report. Try again.";
  }
}

/**
 * Joins a product's waitlist (Phase 4 slice 4.1).
 *
 * The one mutation on this page that a **signed-out** visitor performs, which
 * is what `docs/PRODUCT.md` §13 requires — "a non-logged-in visitor can join a
 * waitlist". So there is no session to authorise against and no account to
 * count a rate limit on: the address and the connecting IP are what the limits
 * are counted against, and Turnstile carries the weight a session would.
 *
 * Nothing is revalidated afterwards. Joining changes no rendered output — the
 * page shows the same form to the next visitor, and telling one visitor that
 * another has joined would be a disclosure, not a feature. Invalidating
 * `/products/[slug]` here would spend the cache ADR-027 exists to protect for
 * no visible change.
 */
export async function joinWaitlistAction(
  _previous: FormActionState | null,
  formData: FormData
): Promise<FormActionState> {
  const ipAddress = await requestIpAddress();

  const challenge = await verifyTurnstile(
    formData.get(TURNSTILE_FIELD),
    "waitlist",
    ipAddress
  );
  if (!challenge.ok) {
    return {
      ok: false,
      message: "That check did not complete. Reload the page and try again.",
    };
  }

  try {
    await joinWaitlist({
      productId: String(formData.get("productId") ?? ""),
      email: formData.get("email"),
      consent: formData.get("consent"),
      ipAddress,
    });

    // Deliberately the same answer for a new signup, a repeat, and an address
    // already confirmed. A form that says "you are already on this list" is an
    // oracle for whether a named person subscribed to a named product.
    return {
      ok: true,
      message:
        "Check your inbox — open the link in that email to confirm your place. Nothing is sent until you do.",
    };
  } catch (error) {
    if (error instanceof WaitlistError) {
      return { ok: false, message: waitlistMessageFor(error) };
    }
    return { ok: false, message: "Could not add you to that list. Try again." };
  }
}

function waitlistMessageFor(error: WaitlistError): string {
  switch (error.code) {
    case "INVALID_EMAIL":
      return "That does not look like an email address.";
    case "CONSENT_REQUIRED":
      return "Tick the box to say you agree to be emailed about this product.";
    case "RATE_LIMITED":
      return `That is a lot of signups from here. Try again ${relativeTime(error.resetAt)}.`;
    case "PRODUCT_NOT_FOUND":
      // The same answer for "no such product" and "its waitlist is off", so
      // this form cannot be used to probe for hidden or draft listings.
      return "That listing is not taking signups.";
    default:
      return "Could not add you to that list. Try again.";
  }
}

/**
 * The visitor's address, as Cloudflare reports it.
 *
 * Passed to siteverify and never stored (docs/LEGAL.md §5). Undefined rather
 * than a placeholder when the header is absent, so the adapter omits the field
 * instead of sending a string Cloudflare has to reject.
 */
async function requestIpAddress(): Promise<string | undefined> {
  return (await headers()).get("cf-connecting-ip") ?? undefined;
}
