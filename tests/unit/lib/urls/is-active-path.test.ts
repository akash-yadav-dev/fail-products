// tests/unit/lib/urls/is-active-path.test.ts
import { describe, expect, it } from "vitest";

import { isActivePath } from "@/lib/urls/is-active-path";

/**
 * Nav highlighting. The trap case is the prefix collision: "/products-archive"
 * shares a string prefix with "/products" but is a different section, and it
 * only fails to match because of the trailing-slash guard. Asserting it is what
 * stops a future `startsWith(href)` refactor from silently breaking the nav.
 */

describe("isActivePath", () => {
  describe("the home link", () => {
    it("is active on the home page", () => {
      expect(isActivePath("/", "/")).toBe(true);
    });

    it("is not active on any other page", () => {
      expect(isActivePath("/products", "/")).toBe(false);
    });

    it("is not active on a nested page", () => {
      expect(isActivePath("/products/some-slug", "/")).toBe(false);
    });
  });

  describe("a section link", () => {
    it("is active on its own page", () => {
      expect(isActivePath("/products", "/products")).toBe(true);
    });

    it("is active on a child page", () => {
      expect(isActivePath("/products/some-slug", "/products")).toBe(true);
    });

    it("is active on a deeply nested child", () => {
      expect(isActivePath("/products/some-slug/edit", "/products")).toBe(true);
    });

    it("is not active on a different section", () => {
      expect(isActivePath("/categories", "/products")).toBe(false);
    });
  });

  describe("prefix collisions", () => {
    it("does not treat /products-archive as part of /products", () => {
      expect(isActivePath("/products-archive", "/products")).toBe(false);
    });

    it("does not treat a child of /products-archive as part of /products", () => {
      expect(isActivePath("/products-archive/2019", "/products")).toBe(false);
    });

    it("does not treat /statuses as part of /status", () => {
      expect(isActivePath("/statuses", "/status")).toBe(false);
    });
  });

  describe("boundaries", () => {
    it("matches a section with its own trailing slash", () => {
      expect(isActivePath("/products/", "/products")).toBe(true);
    });

    it("does not match a longer sibling that only shares a segment start", () => {
      expect(isActivePath("/product", "/products")).toBe(false);
    });
  });
});
