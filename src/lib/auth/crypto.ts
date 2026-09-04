/**
 * Web-Crypto-only primitives for passwordless authentication.
 *
 * Email normalisation and validation used to live here. They are not crypto and
 * they are not auth-specific — the waitlist takes an address from a stranger
 * too — so they moved to `src/lib/validation/email.ts` beside the URL rules.
 */

const TOKEN_BYTES = 32;
const OTP_LENGTH = 6;

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function generateSessionToken(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export function generateOtp(): string {
  const max = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0]! >= max);
  return String(values[0]! % 1_000_000).padStart(OTP_LENGTH, "0");
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return encodeBase64Url(new Uint8Array(digest));
}

/** Constant-time byte comparison for values that have already been hashed. */
export function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}
