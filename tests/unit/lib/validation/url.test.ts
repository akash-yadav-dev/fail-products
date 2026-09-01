// tests/unit/lib/validation/url.test.ts
import { describe, expect, it } from "vitest";

import {
  MAX_URL_LENGTH,
  externalUrlHost,
  isExternalUrlSafe,
  normaliseExternalUrl,
  parseExternalUrl,
  safeExternalHref,
} from "@/lib/validation/url";

/**
 * AGENTS.md §7 requires user-supplied URLs validated at write *and* at render.
 * These are the rejections that make the render-time half worth having.
 */

describe("parseExternalUrl", () => {
  it.each([
    "https://example.com",
    "http://example.com",
    "https://example.com/path?q=1#hash",
    "https://sub.example.co.uk:8443/a",
  ])("accepts %s", (input) => {
    expect(parseExternalUrl(input)).not.toBeNull();
  });

  it.each([
    ["javascript:alert(1)", "the classic href injection"],
    ["JavaScript:alert(1)", "the same, cased to defeat a blocklist"],
    ["  javascript:alert(1)  ", "the same, padded to defeat a trim-less check"],
    ["data:text/html,<script>alert(1)</script>", "an inline document"],
    ["vbscript:msgbox(1)", "the scheme a blocklist forgets"],
    ["file:///etc/passwd", "a local file"],
    ["blob:https://example.com/uuid", "a blob handle"],
    ["mailto:someone@example.com", "not a web link"],
    ["ftp://example.com", "not a web link"],
  ])("rejects %s (%s)", (input) => {
    expect(parseExternalUrl(input)).toBeNull();
  });

  it.each([
    ["", "empty"],
    ["   ", "whitespace"],
    ["example.com", "scheme-less"],
    ["/relative/path", "a relative path"],
    ["//example.com", "protocol-relative"],
    ["https://", "no host"],
    ["not a url at all", "prose"],
  ])("rejects %s (%s)", (input) => {
    expect(parseExternalUrl(input)).toBeNull();
  });

  it.each(["https://", "https:///", "https://:8080/", "https://@/x"])(
    "rejects %s, which the parser refuses outright",
    (input) => {
      // http and https are WHATWG "special schemes": the parser requires a host
      // and throws without one. This is why parseExternalUrl carries no
      // empty-host branch — there is no input that would reach it.
      expect(parseExternalUrl(input)).toBeNull();
    }
  );

  it("treats extra slashes as separators rather than an empty host", () => {
    // Recorded because it is surprising: "https:///path" does not fail, it
    // normalises to the host "path". Odd, but a well-formed link.
    expect(parseExternalUrl("https:///path")?.hostname).toBe("path");
  });

  it("rejects null and undefined", () => {
    expect(parseExternalUrl(null)).toBeNull();
    expect(parseExternalUrl(undefined)).toBeNull();
  });

  it("rejects a URL longer than the cap", () => {
    const long = `https://example.com/${"a".repeat(MAX_URL_LENGTH)}`;
    expect(parseExternalUrl(long)).toBeNull();
  });

  it("trims before parsing", () => {
    expect(parseExternalUrl("  https://example.com  ")?.hostname).toBe(
      "example.com"
    );
  });
});

describe("normaliseExternalUrl", () => {
  it("returns one canonical representation", () => {
    expect(normaliseExternalUrl("https://example.com")).toBe("https://example.com/");
  });

  it("preserves path, query, and fragment", () => {
    expect(normaliseExternalUrl("https://example.com/a?b=1#c")).toBe(
      "https://example.com/a?b=1#c"
    );
  });

  it("returns null for anything unsafe", () => {
    expect(normaliseExternalUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("safeExternalHref", () => {
  it("returns the URL when safe", () => {
    expect(safeExternalHref("https://example.com/a")).toBe("https://example.com/a");
  });

  it("returns null rather than a partially sanitised string", () => {
    // The render site can then omit the link entirely, which is the only safe
    // response to a value that should never have been stored.
    expect(safeExternalHref("javascript:alert(1)")).toBeNull();
  });

  it("rejects at render what would have been rejected at write", () => {
    // The two halves of the §7 rule must agree, or a row that predates the rule
    // renders as a live link.
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "/relative"]) {
      expect(normaliseExternalUrl(bad)).toBeNull();
      expect(safeExternalHref(bad)).toBeNull();
    }
  });
});

describe("isExternalUrlSafe", () => {
  it("agrees with parseExternalUrl", () => {
    for (const input of ["https://example.com", "javascript:alert(1)", "", null]) {
      expect(isExternalUrlSafe(input)).toBe(parseExternalUrl(input) !== null);
    }
  });
});

describe("externalUrlHost", () => {
  it("returns the host for display", () => {
    expect(externalUrlHost("https://example.com/a/b?c=1")).toBe("example.com");
  });

  it("drops a www prefix", () => {
    expect(externalUrlHost("https://www.example.com")).toBe("example.com");
  });

  it("keeps a subdomain that is not www", () => {
    expect(externalUrlHost("https://blog.example.com")).toBe("blog.example.com");
  });

  it("returns null for an unsafe URL", () => {
    expect(externalUrlHost("javascript:alert(1)")).toBeNull();
  });
});
