// src/lib/validation/url.ts
/**
 * External URL validation.
 *
 * `AGENTS.md` §7 requires user-supplied URLs to be validated **at write and at
 * render**, not one or the other. Write-time validation alone is not enough:
 * rows predate rules, an import can bypass the form, and a column that is
 * trusted because "it was checked on the way in" is the shape of every stored
 * XSS. Render-time validation alone is not enough either, because it leaves
 * unusable data in the table.
 *
 * So both call this, and it is cheap enough that doing so costs nothing.
 */

/**
 * The only two schemes ever emitted into an `href`.
 *
 * An allowlist, not a blocklist. Blocking `javascript:` and `data:` leaves
 * `vbscript:`, `blob:`, and whatever a future browser adds; allowing exactly
 * two leaves nothing.
 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Matches `text` columns that hold a URL. Long enough for any real link. */
export const MAX_URL_LENGTH = 2048;

/**
 * Parses a user-supplied URL, returning null unless it is a safe absolute
 * http(s) URL.
 *
 * Returning `URL | null` rather than a boolean means the caller cannot
 * accidentally validate one string and render a different one — the normalised
 * value comes back from the check itself.
 */
export function parseExternalUrl(input: string | null | undefined): URL | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) return null;

  let url: URL;
  try {
    // No base argument, so a relative string throws rather than being resolved
    // against a page URL and silently becoming same-origin.
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;

  // No empty-host check: http and https are WHATWG "special schemes", for which
  // the parser requires a host and throws without one. Verified against Node's
  // URL for `https://`, `https:///`, `https://:8080/`, and `https://@/x` — all
  // throw. A guard here would be unreachable, and unreachable code implies a
  // protection that was never actually exercised.

  return url;
}

/** Whether a string is safe to place in an `href`. */
export function isExternalUrlSafe(input: string | null | undefined): boolean {
  return parseExternalUrl(input) !== null;
}

/**
 * The value to store, or null if it is not storable.
 *
 * Normalising through `URL` at write time means the column holds one
 * representation of a link rather than several, so equality comparisons and
 * duplicate detection work later without re-parsing.
 */
export function normaliseExternalUrl(input: string | null | undefined): string | null {
  return parseExternalUrl(input)?.toString() ?? null;
}

/**
 * The value to render, or null if it must not be rendered.
 *
 * Named separately from the write-time function on purpose: the two call sites
 * are the two halves of the §7 rule, and a single shared name would make it
 * impossible to see in review that both are present.
 */
export function safeExternalHref(input: string | null | undefined): string | null {
  return parseExternalUrl(input)?.toString() ?? null;
}

/**
 * A link's host, for display.
 *
 * Showing "example.com" rather than the raw URL keeps a deceptive path — a link
 * whose text is designed to read like a different site — out of the page.
 */
export function externalUrlHost(input: string | null | undefined): string | null {
  const url = parseExternalUrl(input);
  if (!url) return null;
  return url.hostname.replace(/^www\./, "");
}
