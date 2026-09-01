// tests/unit/domain/product/category.test.ts
import { describe, expect, it } from "vitest";

import {
  PRODUCT_CATEGORIES,
  findCategoryBySlug,
  isProductCategorySlug,
} from "@/domain/product/category";
import { isReservedName } from "@/domain/shared/reserved-names";

/**
 * The taxonomy is fixed and curated (ADR-026), so these are the properties the
 * list itself has to hold — the kind of thing that is obvious in review on the
 * day it is written and silently broken by the fourteenth category someone adds.
 */

describe("the category taxonomy", () => {
  it("has no duplicate slugs, names, or ids", () => {
    const slugs = PRODUCT_CATEGORIES.map((category) => category.slug);
    const names = PRODUCT_CATEGORIES.map((category) => category.name);
    const ids = PRODUCT_CATEGORIES.map((category) => category.id);

    // categories_slug_key and categories_name_key are unique indexes; a
    // duplicate here would make the seed migration fail on a fresh database
    // rather than on the machine that introduced it.
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("claims no reserved name", () => {
    // ADR-019 requires the reserved list to be enforced across all four
    // slug-shaped namespaces, and a category slug is one of them. "search" or
    // "admin" as a category would collide with a route the site may add.
    for (const category of PRODUCT_CATEGORIES) {
      expect(isReservedName(category.slug), category.slug).toBe(false);
    }
  });

  it("uses slugs that are safe in a URL path segment", () => {
    for (const category of PRODUCT_CATEGORIES) {
      expect(category.slug, category.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      // categories.slug is varchar(64).
      expect(category.slug.length).toBeLessThanOrEqual(64);
      expect(category.name.length).toBeLessThanOrEqual(64);
      expect(category.description.length).toBeLessThanOrEqual(200);
    }
  });

  it("carries genuine UUIDv7 identifiers", () => {
    // ADR-021. The seed writes these literally, so a malformed one fails the
    // migration on a fresh database and a v4 would quietly break the rule.
    for (const category of PRODUCT_CATEGORIES) {
      expect(category.id, category.slug).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    }
  });

  it("resolves a known slug and rejects an unknown one", () => {
    expect(findCategoryBySlug("ai")?.name).toBe("AI");
    expect(findCategoryBySlug("not-a-category")).toBeUndefined();
  });

  it("rejects anything not on the list", () => {
    // A <select> is a suggestion; the request is an ordinary form post, and
    // docs/SECURITY.md §4 lists category IDs among the values to validate.
    const rejected = [
      "",
      "AI",
      " ai",
      "ai ",
      "../ai",
      "ai; drop table categories",
      "01a05a43-fc00-7e97-b2d0-086f52378a92",
      null,
      undefined,
      42,
      ["ai"],
    ];

    for (const value of rejected) {
      expect(isProductCategorySlug(value), String(value)).toBe(false);
    }
  });

  it("keeps an overflow category so nothing has to be mislabelled", () => {
    // Without it a founder files their product under something it is not, and
    // a taxonomy full of deliberate mislabels is worse than a junk drawer.
    expect(findCategoryBySlug("other")).toBeDefined();
  });
});
