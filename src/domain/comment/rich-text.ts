// src/domain/comment/rich-text.ts
import { parseExternalUrl } from "@/lib/validation/url";

/**
 * How a stored comment becomes something a page can render.
 *
 * **The output is a structure, never a string of HTML.** That is the whole
 * design. `AGENTS.md` §7 makes `dangerouslySetInnerHTML` over user input a
 * blocker, and the reliable way to honour that is to have no HTML string in
 * existence at any point: this returns typed nodes, the component maps them to
 * React elements, and React escapes every text child. There is nothing for a
 * sanitiser to miss because nothing is ever parsed as markup.
 *
 * **Plain text, not Markdown.** `docs/ENGINEERING.md` §8 asks for "Markdown or
 * plain text"; this takes the second option deliberately. The only Markdown
 * feature a product discussion actually needs is a link, and `[label](url)`
 * hands an attacker a caption of their choosing over a destination of their
 * choosing — a phishing primitive on a site whose entire subject matter is
 * other people's businesses. Bare URLs are autolinked instead, and the visible
 * text is always the real destination.
 *
 * Adding emphasis or code spans later changes this file and nothing else.
 *
 * The one import outside `domain/` is deliberate: `lib/validation/url.ts` owns
 * the allowlist of schemes that may ever reach an `href`, and it depends on
 * nothing at all. A second copy of that allowlist is exactly the drift that
 * turns one hardened rule into two, one of which is out of date.
 */

export type CommentInline =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "link"; readonly href: string; readonly label: string };

export type CommentParagraph = {
  /** Lines within one paragraph. A soft break, not a new block. */
  readonly lines: readonly (readonly CommentInline[])[];
};

/**
 * Matches a candidate URL, then hands it to the allowlist.
 *
 * Deliberately loose — it finds something that *looks* like a link, and
 * `parseExternalUrl` decides whether it is one. A regex that tries to be the
 * security control is the classic way to ship a bypass; here the regex only has
 * to avoid missing links, and being wrong is a link rendered as plain text.
 *
 * `https?://` is required rather than optional. Autolinking a bare `example.com`
 * would turn any sentence containing a domain into a link the author did not
 * write, and on this site those sentences are about other people's companies.
 */
const URL_CANDIDATE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

/**
 * Characters a URL may end with that are almost certainly punctuation.
 *
 * "See https://example.com." should not link the full stop, and a URL inside
 * parentheses should not swallow the closing one. Trimmed from the right until
 * nothing is left to trim, and the trimmed characters are re-emitted as text.
 */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

export function parseCommentRichText(
  body: string
): readonly CommentParagraph[] {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => ({
      lines: block.split("\n").map((line) => parseInline(line)),
    }));
}

/** One line, split into text runs and validated links. */
function parseInline(line: string): readonly CommentInline[] {
  const nodes: CommentInline[] = [];
  let cursor = 0;

  // `matchAll` on a /g regex, so the lastIndex bookkeeping that makes `exec`
  // loops subtly wrong is not this function's problem.
  for (const match of line.matchAll(URL_CANDIDATE)) {
    const start = match.index;
    const raw = match[0];

    const trailing = TRAILING_PUNCTUATION.exec(raw)?.[0] ?? "";
    const candidate = trailing ? raw.slice(0, -trailing.length) : raw;

    const url = parseExternalUrl(candidate);

    if (start > cursor) {
      pushText(nodes, line.slice(cursor, start));
    }

    if (url) {
      // The href is the *parsed* URL's own serialisation, not the substring
      // that was matched. Rendering a different string from the one that was
      // validated is how a validated-then-mutated URL becomes a live bypass.
      nodes.push({ kind: "link", href: url.toString(), label: candidate });
      if (trailing) pushText(nodes, trailing);
    } else {
      // Not a URL this site will emit. It stays visible as text — silently
      // deleting what someone typed reads as the site editing them.
      pushText(nodes, raw);
    }

    cursor = start + raw.length;
  }

  if (cursor < line.length) pushText(nodes, line.slice(cursor));

  return nodes;
}

/** Appends text, merging with the previous run so nodes do not fragment. */
function pushText(nodes: CommentInline[], value: string) {
  if (value.length === 0) return;

  const last = nodes.at(-1);
  if (last?.kind === "text") {
    nodes[nodes.length - 1] = { kind: "text", value: last.value + value };
    return;
  }

  nodes.push({ kind: "text", value });
}
