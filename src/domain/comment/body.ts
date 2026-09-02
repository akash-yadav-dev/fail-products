// src/domain/comment/body.ts
/**
 * What a comment body must look like before it is stored.
 *
 * The bounds match the `comments_body_length` CHECK constraint exactly. Both
 * exist on purpose: the parser gives a person a usable message, and the
 * constraint is what holds when a row arrives by some route the parser did not
 * see. A limit that lives in only one of the two is a limit that an import,
 * a script, or a future endpoint bypasses.
 *
 * Domain code imports nothing from Next.js, React, Drizzle, or any provider.
 */

export const MIN_COMMENT_LENGTH = 1;
export const MAX_COMMENT_LENGTH = 5000;

export type CommentBodyRejection = "EMPTY" | "TOO_LONG";

export type CommentBodyResult =
  | { readonly ok: true; readonly body: string }
  | { readonly ok: false; readonly reason: CommentBodyRejection };

/**
 * Normalises and bounds a submitted comment.
 *
 * Three things happen, and each has a reason:
 *
 * - **Line endings collapse to `\n`.** A form posts `\r\n`; the renderer splits
 *   on `\n`. Storing both means a paragraph break works from one browser and
 *   not another.
 * - **Runs of blank lines collapse to one.** Otherwise a comment made of two
 *   hundred newlines is a comment that occupies the whole page, which is a
 *   layout attack that costs nothing to send.
 * - **Length is measured after trimming**, so whitespace cannot be used to pass
 *   the minimum or to pad past the maximum.
 *
 * Rejected rather than truncated. Silently cutting someone's last paragraph off
 * is worse than telling them it was too long.
 */
export function parseCommentBody(input: unknown): CommentBodyResult {
  if (typeof input !== "string") return { ok: false, reason: "EMPTY" };

  const body = input
    .replace(/\r\n?/g, "\n")
    // Zero-width and bidirectional control characters. They are invisible, and
    // the bidi ones can make text render in an order the author did not write —
    // which on a page of criticism about a named business is a way to put words
    // in someone's mouth that no amount of escaping catches.
    .replace(/[\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (body.length < MIN_COMMENT_LENGTH) return { ok: false, reason: "EMPTY" };
  if (body.length > MAX_COMMENT_LENGTH) {
    return { ok: false, reason: "TOO_LONG" };
  }

  return { ok: true, body };
}
