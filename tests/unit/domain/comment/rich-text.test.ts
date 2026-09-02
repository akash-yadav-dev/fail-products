// tests/unit/domain/comment/rich-text.test.ts
import { describe, expect, it } from "vitest";

import {
  parseCommentRichText,
  type CommentInline,
} from "@/domain/comment/rich-text";

/**
 * The renderer, one XSS vector per test.
 *
 * The Phase 3 plan asks for these explicitly, and they read oddly at first: the
 * parser returns *data*, so a `<script>` tag in a comment is only ever the
 * string `"<script>"` in a text node, and React escapes it. That is the point.
 * These tests pin the property that makes it true — **no input produces markup,
 * and no input produces a link this site would not emit** — so that a later
 * change to a Markdown parser or an HTML pass-through fails here first.
 *
 * A test that asserted "the output contains `&lt;script&gt;`" would be testing
 * an escaping step this design does not have. What is asserted instead is that
 * hostile input stays a text node, and that every emitted href is http(s).
 */

/** Every link a body would render. The security-relevant output. */
function hrefs(body: string): string[] {
  return parseCommentRichText(body)
    .flatMap((paragraph) => paragraph.lines)
    .flat()
    .filter((node): node is Extract<CommentInline, { kind: "link" }> =>
      node.kind === "link"
    )
    .map((node) => node.href);
}

/** Everything a body would render as text. */
function text(body: string): string {
  return parseCommentRichText(body)
    .flatMap((paragraph) => paragraph.lines)
    .flat()
    .map((node) => (node.kind === "text" ? node.value : node.label))
    .join("");
}

describe("hostile input stays text", () => {
  it("does not turn a script tag into anything but text", () => {
    const body = '<script>alert("xss")</script>';

    const nodes = parseCommentRichText(body)[0]!.lines[0]!;

    expect(nodes).toEqual([{ kind: "text", value: body }]);
  });

  it("does not turn an img onerror attribute into anything but text", () => {
    const body = '<img src=x onerror="alert(1)">';

    expect(parseCommentRichText(body)[0]!.lines[0]).toEqual([
      { kind: "text", value: body },
    ]);
  });

  it("does not link a javascript: URL", () => {
    expect(hrefs('javascript:alert("xss")')).toEqual([]);
  });

  it("does not link a javascript: URL disguised with whitespace", () => {
    // `java\tscript:` is stripped back to `javascript:` by some HTML parsers.
    // Nothing here parses HTML, so the string is simply never a link.
    expect(hrefs("java\tscript:alert(1)")).toEqual([]);
  });

  it("does not link a data: URL", () => {
    expect(
      hrefs("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")
    ).toEqual([]);
  });

  it("does not link a vbscript: URL", () => {
    // The reason the scheme rule is an allowlist. Blocking javascript: and
    // data: by name leaves this one, and whatever a future browser adds.
    expect(hrefs("vbscript:msgbox(1)")).toEqual([]);
  });

  it("does not link a file: URL", () => {
    expect(hrefs("file:///etc/passwd")).toEqual([]);
  });

  it("keeps an unsafe URL visible as text rather than deleting it", () => {
    // Silently removing what somebody typed reads as the site editing them.
    // It is inert either way: it is a string in a text node.
    expect(text("read javascript:alert(1) here")).toBe(
      "read javascript:alert(1) here"
    );
  });

  it("does not let a quote break out of an attribute, because there is none", () => {
    const body = '" onmouseover="alert(1)';

    expect(parseCommentRichText(body)[0]!.lines[0]).toEqual([
      { kind: "text", value: body },
    ]);
  });

  it("does not treat U+2028 as a line break", () => {
    // JavaScript's own line-terminator set includes U+2028, which is why a
    // string in a script tag can be broken by one. This splits on newlines and
    // nothing else, so it cannot be used to forge a paragraph boundary. The
    // character is stripped at write by parseCommentBody as well.
    const separator = String.fromCharCode(0x2028);

    const paragraphs = parseCommentRichText(`one${separator}${separator}two`);

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]!.lines).toHaveLength(1);
  });
});

describe("links", () => {
  it("links a bare https URL", () => {
    expect(hrefs("see https://example.com/x for details")).toEqual([
      "https://example.com/x",
    ]);
  });

  it("links a bare http URL", () => {
    expect(hrefs("http://example.com")).toEqual(["http://example.com/"]);
  });

  it("does not link a bare domain", () => {
    // Autolinking `example.com` would make a link out of any sentence that
    // mentions a company, on a site whose subject is other people's companies.
    expect(hrefs("example.com is gone")).toEqual([]);
  });

  it("shows the destination as the label, never a caption", () => {
    const [node] = parseCommentRichText("https://example.com/pricing")[0]!
      .lines[0]!;

    expect(node).toEqual({
      kind: "link",
      href: "https://example.com/pricing",
      label: "https://example.com/pricing",
    });
  });

  it("leaves a trailing full stop out of the link", () => {
    expect(hrefs("it was at https://example.com/x.")).toEqual([
      "https://example.com/x",
    ]);
    expect(text("it was at https://example.com/x.")).toBe(
      "it was at https://example.com/x."
    );
  });

  it("leaves a closing parenthesis out of the link", () => {
    expect(hrefs("(see https://example.com/x)")).toEqual([
      "https://example.com/x",
    ]);
  });

  it("links more than one URL in a line", () => {
    expect(
      hrefs("https://a.example.com and https://b.example.com")
    ).toEqual(["https://a.example.com/", "https://b.example.com/"]);
  });

  it("emits the parsed URL, not the matched substring", () => {
    // The validated value and the rendered value are the same object. A
    // validated-then-remutated URL is how a scheme check gets bypassed.
    expect(hrefs("HTTPS://Example.COM/Path")).toEqual([
      "https://example.com/Path",
    ]);
  });
});

describe("structure", () => {
  it("splits paragraphs on a blank line", () => {
    expect(parseCommentRichText("one\n\ntwo")).toHaveLength(2);
  });

  it("keeps a single newline as a soft break inside one paragraph", () => {
    const [paragraph] = parseCommentRichText("one\ntwo");

    expect(paragraph!.lines).toHaveLength(2);
  });

  it("drops empty paragraphs rather than rendering blank space", () => {
    expect(parseCommentRichText("one\n\n\n\ntwo")).toHaveLength(2);
  });

  it("returns nothing for an empty body", () => {
    expect(parseCommentRichText("")).toEqual([]);
  });

  it("merges adjacent text runs so nodes do not fragment", () => {
    const nodes = parseCommentRichText("a javascript:x b")[0]!.lines[0]!;

    expect(nodes).toHaveLength(1);
  });
});
