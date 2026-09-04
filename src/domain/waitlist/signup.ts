// src/domain/waitlist/signup.ts
/**
 * What a waitlist signup must contain before it is stored.
 *
 * `docs/PRODUCT.md` §5.1 names three minimum fields — email, product, and a
 * consent/terms acknowledgement. The third is the one that is easy to treat as
 * a formality and is not: `docs/LEGAL.md` §5 files waitlist entries as
 * **consent-based**, so the consent record is the entire lawful basis for
 * every email that address will ever receive from this site. An entry without
 * one is not an entry with a missing field; it is an address we may not write
 * to.
 *
 * Domain code imports nothing from Next.js, React, Drizzle, or any provider.
 * The email rule comes from `lib/validation`, the same place
 * `domain/comment/rich-text.ts` gets its URL rule.
 */
import { parseEmailAddress } from "@/lib/validation/email";

/**
 * Where an entry is between joining and being reachable.
 *
 * Two states, not three. "Unsubscribed" is deliberately absent: `LEGAL.md` §5
 * says a waitlist entry is *erased* on request by the subscriber, and a row
 * flagged UNSUBSCRIBED is personal data that has not been deleted — which the
 * same section calls out by name. Leaving the state out is what stops the
 * cheaper, wrong implementation being written later.
 */
export const WAITLIST_ENTRY_STATUSES = ["PENDING", "CONFIRMED"] as const;
export type WaitlistEntryStatus = (typeof WAITLIST_ENTRY_STATUSES)[number];

/**
 * The sentence a subscriber agrees to, stored verbatim with the entry.
 *
 * Stored rather than referenced, because consent is only evidence if you can
 * show *what* was consented to. If this wording is edited next year, every
 * entry taken under the old wording still carries the old wording, and a
 * complaint about an email can be answered with the text that was actually on
 * screen. A version number pointing at a document that has since changed
 * proves nothing.
 */
export const WAITLIST_CONSENT_STATEMENT =
  "I agree to receive email from this product's founder about its comeback, and I can remove my address at any time.";

/** Matches `varchar(320)` on `waitlist_entries.consent_statement`'s length cap. */
export const MAX_CONSENT_STATEMENT_LENGTH = 400;

export type WaitlistSignupRejection = "INVALID_EMAIL" | "CONSENT_REQUIRED";

export type WaitlistSignup = {
  readonly email: string;
  readonly consentStatement: string;
};

export type WaitlistSignupResult =
  | { readonly ok: true; readonly signup: WaitlistSignup }
  | { readonly ok: false; readonly reason: WaitlistSignupRejection };

/**
 * Whether a submitted checkbox counts as consent.
 *
 * An unchecked HTML checkbox sends **nothing at all** — the field is absent
 * from the body rather than present and false. So the only safe reading is an
 * allowlist of affirmative values, and everything else, `undefined` included,
 * is a refusal. A truthiness test would treat the string `"false"` as consent,
 * which is how a checkbox posted by a script becomes a lawful basis.
 */
export function hasWaitlistConsent(input: unknown): boolean {
  return input === "on" || input === "true" || input === true;
}

/**
 * Parses a signup, or says which of the two rules it broke.
 *
 * Email first, so somebody who mistypes their address is told that rather than
 * being told about the checkbox they did tick.
 */
export function parseWaitlistSignup(input: {
  email: unknown;
  consent: unknown;
}): WaitlistSignupResult {
  const email = parseEmailAddress(input.email);
  if (!email.ok) return { ok: false, reason: "INVALID_EMAIL" };

  if (!hasWaitlistConsent(input.consent)) {
    return { ok: false, reason: "CONSENT_REQUIRED" };
  }

  return {
    ok: true,
    signup: {
      email: email.email,
      consentStatement: WAITLIST_CONSENT_STATEMENT,
    },
  };
}
