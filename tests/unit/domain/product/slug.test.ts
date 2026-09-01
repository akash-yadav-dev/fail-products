// tests/unit/domain/product/slug.test.ts
import { describe, expect, it } from "vitest";

import { isReservedName } from "@/domain/shared/reserved-names";
import {
  FALLBACK_SLUG,
  MAX_SLUG_LENGTH,
  isValidSlug,
  slugCandidates,
  slugify,
} from "@/domain/product/slug";

/**
 * Slugs are permanent (ADR-019): retired ones are recorded and never reused, so
 * a slug generated badly cannot be quietly corrected later without discarding
 * the inbound links it earned.
 */

describe("slugify", () => {
  it("lowercases and hyphenates a plain name", () => {
    expect(slugify("Fail Products")).toBe("fail-products");
  });

  it("keeps digits", () => {
    expect(slugify("Web3 Analytics 2")).toBe("web3-analytics-2");
  });

  it("strips diacritics rather than the letters carrying them", () => {
    // NFKD splits the accent off; dropping the base letter too would give "caf".
    expect(slugify("Café Zéro")).toBe("cafe-zero");
  });

  it("collapses runs of separators into one hyphen", () => {
    expect(slugify("a   ---   b")).toBe("a-b");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
  });

  it("removes punctuation entirely", () => {
    expect(slugify("What?! It's... Over.")).toBe("what-it-s-over");
  });

  it("returns empty for a name with no transliterable characters", () => {
    // Not an error — slugCandidates supplies the fallback. See below.
    expect(slugify("日本語")).toBe("");
    expect(slugify("🎉🎉")).toBe("");
  });

  it("returns empty for whitespace only", () => {
    expect(slugify("   ")).toBe("");
  });

  it("caps length at the column width", () => {
    const slug = slugify("a".repeat(200));
    expect(slug).toHaveLength(MAX_SLUG_LENGTH);
  });

  it("never ends in a hyphen after truncation", () => {
    // The cut can land immediately after a word boundary.
    const name = `${"a".repeat(MAX_SLUG_LENGTH - 1)} bbbb`;
    expect(slugify(name).endsWith("-")).toBe(false);
  });
});

describe("slugCandidates", () => {
  it("offers the plain slug first", () => {
    expect(slugCandidates("Fail Products")[0]).toBe("fail-products");
  });

  it("suffixes subsequent candidates so a collision has somewhere to go", () => {
    const [first, second, third] = slugCandidates("Fail Products");
    expect([first, second, third]).toEqual([
      "fail-products",
      "fail-products-2",
      "fail-products-3",
    ]);
  });

  it("never offers a reserved name", () => {
    // A product named "Status" must not take the reserved word (ADR-019).
    const candidates = slugCandidates("Status");
    expect(candidates).not.toContain("status");
    expect(candidates[0]).toBe("status-2");
  });

  it("offers no reserved name anywhere in the list", () => {
    for (const name of ["admin", "API", "New", "Dashboard", "u"]) {
      for (const candidate of slugCandidates(name, 10)) {
        expect(isReservedName(candidate)).toBe(false);
      }
    }
  });

  it("falls back for a name that normalises to nothing", () => {
    expect(slugCandidates("日本語")[0]).toBe(FALLBACK_SLUG);
  });

  it("keeps every candidate inside the column width", () => {
    for (const candidate of slugCandidates("x".repeat(300), 25)) {
      expect(candidate.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    }
  });

  it("keeps long-name candidates distinct once truncated", () => {
    // Truncating the suffix instead of the base would collide forever.
    const candidates = slugCandidates("x".repeat(300), 30);
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it("returns exactly the requested number of candidates", () => {
    expect(slugCandidates("Fail Products", 5)).toHaveLength(5);
  });

  it("still returns the requested number when the base is reserved", () => {
    expect(slugCandidates("admin", 5)).toHaveLength(5);
  });
});

describe("isValidSlug", () => {
  it.each(["fail-products", "web3", "a-b-c", "x2"])("accepts %s", (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["Fail-Products", "uppercase"],
    ["-leading", "leading hyphen"],
    ["trailing-", "trailing hyphen"],
    ["double--hyphen", "consecutive hyphens"],
    ["has space", "whitespace"],
    ["has_underscore", "underscore"],
    ["café", "non-ascii"],
    ["admin", "reserved"],
  ])("rejects %s (%s)", (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });

  it("rejects a slug longer than the column", () => {
    expect(isValidSlug("a".repeat(MAX_SLUG_LENGTH + 1))).toBe(false);
  });

  it("accepts a slug exactly at the column width", () => {
    expect(isValidSlug("a".repeat(MAX_SLUG_LENGTH))).toBe(true);
  });

  it("accepts every candidate it generates", () => {
    // The generator and the validator must agree, or a product can be created
    // with a slug the application then refuses to resolve.
    for (const name of ["Fail Products", "Status", "日本語", "x".repeat(300)]) {
      for (const candidate of slugCandidates(name, 5)) {
        expect(isValidSlug(candidate)).toBe(true);
      }
    }
  });
});
