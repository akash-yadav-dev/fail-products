// tests/unit/domain/comment/body.test.ts
import { describe, expect, it } from "vitest";

import {
  MAX_COMMENT_LENGTH,
  parseCommentBody,
} from "@/domain/comment/body";

describe("parseCommentBody", () => {
  it("accepts an ordinary comment", () => {
    expect(parseCommentBody("The onboarding lost me on step three.")).toEqual({
      ok: true,
      body: "The onboarding lost me on step three.",
    });
  });

  it("rejects an empty body", () => {
    expect(parseCommentBody("")).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("rejects whitespace pretending to be a comment", () => {
    expect(parseCommentBody("   \n\n\t  ")).toEqual({
      ok: false,
      reason: "EMPTY",
    });
  });

  it("rejects a value that is not a string at all", () => {
    // The input is a form field. `formData.get` returns a File for a file
    // input, and null for a name that was never sent.
    expect(parseCommentBody(null)).toEqual({ ok: false, reason: "EMPTY" });
    expect(parseCommentBody(42)).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("accepts a body exactly at the maximum", () => {
    const result = parseCommentBody("a".repeat(MAX_COMMENT_LENGTH));

    expect(result.ok).toBe(true);
  });

  it("rejects one character past the maximum", () => {
    expect(parseCommentBody("a".repeat(MAX_COMMENT_LENGTH + 1))).toEqual({
      ok: false,
      reason: "TOO_LONG",
    });
  });

  it("measures length after trimming, so padding cannot pass the maximum", () => {
    const result = parseCommentBody(
      `   ${"a".repeat(MAX_COMMENT_LENGTH)}   `
    );

    expect(result.ok).toBe(true);
  });

  it("rejects rather than truncating", () => {
    // Silently cutting off somebody's last paragraph is worse than saying no.
    const result = parseCommentBody("a".repeat(MAX_COMMENT_LENGTH + 500));

    expect(result).toEqual({ ok: false, reason: "TOO_LONG" });
  });

  it("normalises Windows line endings", () => {
    const result = parseCommentBody("one\r\ntwo");

    expect(result).toEqual({ ok: true, body: "one\ntwo" });
  });

  it("collapses a run of blank lines to one paragraph break", () => {
    // A comment made of two hundred newlines occupies the whole page, which is
    // a layout attack that costs nothing to send.
    const result = parseCommentBody(`one${"\n".repeat(200)}two`);

    expect(result).toEqual({ ok: true, body: "one\n\ntwo" });
  });

  it("strips zero-width characters", () => {
    const zeroWidth = String.fromCharCode(0x200b);

    expect(parseCommentBody(`sp${zeroWidth}am`)).toEqual({
      ok: true,
      body: "spam",
    });
  });

  it("strips bidirectional overrides", () => {
    // U+202E reverses the rendering of everything after it. On a page of
    // criticism about a named business, that is a way to make text read as
    // something its author did not write — and no amount of HTML escaping
    // catches it, because it is not markup.
    const override = String.fromCharCode(0x202e);

    expect(parseCommentBody(`safe${override}txet`)).toEqual({
      ok: true,
      body: "safetxet",
    });
  });

  it("rejects a body that is only invisible characters", () => {
    const zeroWidth = String.fromCharCode(0x200b).repeat(20);

    expect(parseCommentBody(zeroWidth)).toEqual({
      ok: false,
      reason: "EMPTY",
    });
  });
});
