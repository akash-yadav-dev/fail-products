import { parseEmailAddress } from "@/lib/validation/email";

/** The public mailbox for correction, delist, and data requests. */
export function legalContactEmail(): string | null {
  const value = process.env.LEGAL_CONTACT_EMAIL;
  if (!value) return null;

  const parsed = parseEmailAddress(value);
  if (!parsed.ok) return null;

  // This address is interpolated into a mailto URL. Keep its syntax narrower
  // than the user-email validator so a mistaken config cannot add recipients,
  // headers, or a URL fragment through mailto delimiters.
  return /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(parsed.email)
    ? parsed.email
    : null;
}
