// tests/unit/lib/urls/outbound.test.ts
import { describe, expect, it } from "vitest";

import {
  OUTBOUND_CAMPAIGNS,
  buildOutboundProductUrl,
} from "@/lib/urls/outbound";

/**
 * The outbound link is the one place a stored, user-supplied URL becomes an
 * `href` on a public page. Everything here is about what must never come out of
 * this function.
 */

describe("buildOutboundProductUrl", () => {
  it("attaches the attribution parameters docs/PRODUCT.md §5.1 specifies", () => {
    const built = buildOutboundProductUrl(
      "https://example.com/",
      OUTBOUND_CAMPAIGNS.productPage
    );

    const url = new URL(built!);
    expect(url.searchParams.get("utm_source")).toBe("failproducts");
    expect(url.searchParams.get("utm_medium")).toBe("referral");
    expect(url.searchParams.get("utm_campaign")).toBe("product-page");
  });

  it("keeps the path and the product's own query parameters", () => {
    const built = buildOutboundProductUrl(
      "https://example.com/pricing?plan=pro",
      OUTBOUND_CAMPAIGNS.productPage
    );

    const url = new URL(built!);
    expect(url.pathname).toBe("/pricing");
    expect(url.searchParams.get("plan")).toBe("pro");
  });

  it("overwrites attribution the stored URL already carried", () => {
    // Two utm_source values is not a link with two sources; it is a link whose
    // attribution depends on which one the destination reads first.
    const built = buildOutboundProductUrl(
      "https://example.com/?utm_source=elsewhere&utm_campaign=theirs",
      OUTBOUND_CAMPAIGNS.productPage
    );

    const url = new URL(built!);
    expect(url.searchParams.getAll("utm_source")).toEqual(["failproducts"]);
    expect(url.searchParams.getAll("utm_campaign")).toEqual(["product-page"]);
  });

  it("rejects every scheme that is not http or https", () => {
    // The rule this enforces is an allowlist, not a blocklist: blocking
    // javascript: and data: leaves vbscript:, blob:, and whatever ships next.
    const rejected = [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)  ",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:msgbox(1)",
      "blob:https://example.com/1234",
      "file:///etc/passwd",
      "ftp://example.com/x",
      "mailto:someone@example.com",
      "tel:+15551234567",
    ];

    for (const value of rejected) {
      expect(
        buildOutboundProductUrl(value, OUTBOUND_CAMPAIGNS.productPage),
        value
      ).toBeNull();
    }
  });

  it("rejects a relative URL rather than resolving it against our own origin", () => {
    // With a base argument these would silently become same-origin links, which
    // is how an outbound link turns into an internal one nobody reviewed.
    for (const value of ["/products/x", "//evil.example.com", "products/x", "?a=1"]) {
      expect(
        buildOutboundProductUrl(value, OUTBOUND_CAMPAIGNS.productPage),
        value
      ).toBeNull();
    }
  });

  it("returns null when there is no URL at all", () => {
    for (const value of [null, undefined, "", "   "]) {
      expect(buildOutboundProductUrl(value, OUTBOUND_CAMPAIGNS.productPage)).toBeNull();
    }
  });

  it("labels each surface the visitor left from", () => {
    const fromList = buildOutboundProductUrl(
      "https://example.com",
      OUTBOUND_CAMPAIGNS.productList
    );

    expect(new URL(fromList!).searchParams.get("utm_campaign")).toBe(
      "product-list"
    );
  });
});
