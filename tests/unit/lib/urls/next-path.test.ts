// tests/unit/lib/urls/next-path.test.ts
import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/urls/next-path";

/**
 * `?next=` is obeyed immediately after authentication, which is the moment a
 * person is most likely to trust wherever they land. Every case below is a way
 * to turn that into somebody else's page.
 */

describe("safeNextPath", () => {
  it("accepts a same-origin path", () => {
    for (const path of [
      "/",
      "/products",
      "/products/some-slug",
      "/products/some-slug#discussion",
      "/products?category=ai&status=SHUT_DOWN",
      "/u/someone",
    ]) {
      expect(safeNextPath(path), path).toBe(path);
    }
  });

  it("refuses anything that could leave the origin", () => {
    const refused = [
      // Protocol-relative: the browser reads what follows as a host, so
      // "starts with a slash" is not on its own a same-origin check.
      "//evil.example",
      "//evil.example/products",
      // Backslash variants, because some browsers normalise them to a slash
      // and this becomes the case above.
      "/\\evil.example",
      "/\\/evil.example",
      "/products\\..\\admin",
      // A scheme, in the forms that actually get tried.
      "https://evil.example",
      "http://evil.example",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      // Not a path at all.
      "evil.example",
      "products",
      "",
    ];

    for (const value of refused) {
      expect(safeNextPath(value), JSON.stringify(value)).toBeNull();
    }
  });

  it("refuses control characters that could split or truncate a header", () => {
    // Built by code point so the test file itself carries no raw control bytes.
    for (const code of [0x00, 0x09, 0x0a, 0x0d, 0x1f, 0x7f]) {
      const value = `/products${String.fromCharCode(code)}/evil`;
      expect(safeNextPath(value), `code point ${code}`).toBeNull();
    }
  });

  it("refuses a non-string, and anything absurdly long", () => {
    for (const value of [null, undefined, 42, {}, ["/products"], true]) {
      expect(safeNextPath(value), String(value)).toBeNull();
    }
    // A bounded length keeps a redirect target out of the "how long can a
    // header be" question entirely.
    expect(safeNextPath(`/${"a".repeat(512)}`)).toBeNull();
  });
});
