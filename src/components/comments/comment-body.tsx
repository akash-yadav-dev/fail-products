// src/components/comments/comment-body.tsx
import { parseCommentRichText } from "@/domain/comment/rich-text";

/**
 * A stored comment, rendered.
 *
 * There is no HTML string anywhere in this path. The body is parsed into typed
 * nodes and mapped to React elements, so every piece of text is a React text
 * child — which React escapes — and every `href` came back from the scheme
 * allowlist in `lib/validation/url.ts` rather than from the comment.
 *
 * `AGENTS.md` §7 makes `dangerouslySetInnerHTML` over user input a blocker.
 * The reliable way to honour that is not to sanitise carefully; it is to never
 * produce markup in the first place, so there is nothing for a sanitiser to
 * miss. `tests/unit/domain/comment/rich-text.test.ts` pins one vector per test.
 */
export function CommentBody({ body }: { body: string }) {
  const paragraphs = parseCommentRichText(body);

  return (
    <div className="flex flex-col gap-3 text-sm text-foreground/90 text-pretty">
      {paragraphs.map((paragraph, paragraphIndex) => (
        <p key={paragraphIndex}>
          {paragraph.lines.map((line, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 ? <br /> : null}
              {line.map((node, nodeIndex) =>
                node.kind === "link" ? (
                  <a
                    key={nodeIndex}
                    href={node.href}
                    target="_blank"
                    // `nofollow ugc`: a comment link is user-generated content
                    // and this site does not vouch for it. `noopener` is what
                    // keeps the opened page from reaching back through
                    // window.opener.
                    rel="noopener noreferrer nofollow ugc"
                    className="rounded-sm underline underline-offset-4 outline-none hover:no-underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {node.label}
                  </a>
                ) : (
                  <span key={nodeIndex}>{node.value}</span>
                )
              )}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
