// src/lib/validation/email.ts
/**
 * Email address validation.
 *
 * One implementation, used by everything that takes an address from a stranger:
 * sign-in, and now the waitlist. It lived in `lib/auth/crypto.ts` while
 * authentication was the only caller, which made it look like an auth
 * primitive; it is not, and a second copy written next to the waitlist form
 * would be the duplicate utility `AGENTS.md` §3 warns about.
 *
 * It sits beside `url.ts` because both answer the same question — is this
 * string safe to store and to act on — and because `domain/` is allowed to
 * import from `lib/validation/` (`domain/comment/rich-text.ts` already does).
 *
 * **Deliberately permissive.** The grammar of a real address is RFC 5321, and
 * every regex that claims to implement it rejects addresses that work. The only
 * check that proves an address exists is sending to it, which is exactly what
 * the sign-in code and the waitlist confirmation do. This rejects what is
 * obviously not an address — no `@`, no dot in the domain, whitespace, or too
 * long for the column — and leaves the rest to delivery.
 */

/** The maximum an address may be, per RFC 5321 and the `varchar(320)` columns. */
export const MAX_EMAIL_LENGTH = 320;

/**
 * Lowercased and trimmed.
 *
 * The local part is technically case-sensitive; no provider in practice treats
 * it that way, and storing two casings of one address as two rows would mean
 * one person on a waitlist twice and two sign-in identities for one mailbox.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type EmailResult =
  | { readonly ok: true; readonly email: string }
  | { readonly ok: false; readonly reason: "INVALID_EMAIL" };

/**
 * Normalises and validates in one step.
 *
 * The pair is separable and both halves are used on their own inside the auth
 * flow, but every *new* caller wants them together — and calling only one of
 * them is the mistake that stores `  Founder@Example.test ` as a distinct
 * subscriber. Returning the normalised value from the check is what makes it
 * impossible to validate one string and store another, the same property
 * `parseExternalUrl` has.
 */
export function parseEmailAddress(input: unknown): EmailResult {
  if (typeof input !== "string") return { ok: false, reason: "INVALID_EMAIL" };

  const email = normalizeEmail(input);
  if (!isValidEmail(email)) return { ok: false, reason: "INVALID_EMAIL" };

  return { ok: true, email };
}
