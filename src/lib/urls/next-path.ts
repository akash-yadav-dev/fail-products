// src/lib/urls/next-path.ts

/**
 * Validates a post-sign-in return path.
 *
 * A `?next=` parameter is an open redirect waiting to happen: whatever it says,
 * the application obeys right after authenticating, which is exactly the moment
 * a person is most likely to trust the page they land on. So this accepts a
 * **same-origin path and nothing else** — never an absolute URL, never a host,
 * never a scheme.
 *
 * The rejections that matter and are easy to get wrong:
 *
 * - `//evil.example` is protocol-relative. A browser reads it as a *host*, so
 *   "starts with a slash" alone is not a same-origin check.
 * - `/\evil.example` — some browsers normalise a backslash to a forward slash,
 *   which turns this back into the case above.
 * - `https://evil.example` and `javascript:...` carry a scheme.
 * - A control character can truncate or split the value inside a header.
 *
 * Returns the path when it is safe to redirect to, or `null`. A caller that
 * gets `null` sends the person to the default destination rather than failing —
 * a bad `next` is not worth an error page, and not redirecting is already the
 * safe outcome.
 */
export function safeNextPath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  if (input.length === 0 || input.length > 512) return null;

  // One leading slash, and the next character must not be another slash or a
  // backslash — that is the protocol-relative case.
  if (input[0] !== "/") return null;
  if (input[1] === "/" || input[1] === "\\") return null;

  // A backslash anywhere is refused rather than normalised. Browsers disagree
  // about how they treat it, and this is not the place to model that.
  if (input.includes("\\")) return null;

  // Control characters, including the newline that would split a header.
  // Checked by code point rather than with a regex literal: a regex spelling
  // this range has to carry either raw control bytes or escapes, and every tool
  // in the chain — editor, shell, formatter — gets a chance to mangle those
  // silently. A loop cannot be misread.
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return null;
  }

  return input;
}
