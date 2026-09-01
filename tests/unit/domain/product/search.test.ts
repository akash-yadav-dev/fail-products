// tests/unit/domain/product/search.test.ts
import { describe, expect, it } from "vitest";

import { MAX_SEARCH_LENGTH, parseSearchQuery } from "@/domain/product/search";

/**
 * The three cases the plan names — an empty query, a very long one, and one
 * that is entirely punctuation — plus the reason each one matters.
 *
 * None of this is what makes the query injection-safe. The term is a bound
 * parameter and Postgres parses it with `websearch_to_tsquery`; this module
 * only decides whether running a query is worth doing at all.
 */

describe("parseSearchQuery", () => {
  it("returns null for an empty query", () => {
    // Null is the "show the whole directory" signal. Rendering "no results" for
    // a blank box would be a false statement about the directory.
    for (const value of ["", "   ", "\t\n ", null, undefined]) {
      expect(parseSearchQuery(value)).toBeNull();
    }
  });

  it("returns null for a query that is entirely punctuation", () => {
    // websearch_to_tsquery('english', '---') is an empty tsquery: it matches
    // nothing, so running it is a billed round trip with one possible outcome.
    const punctuation = [
      "---",
      "!!!",
      "...",
      "&|!()",
      '"""',
      "?!,.;:",
      "<>{}[]",
      "   *   ",
    ];

    for (const value of punctuation) {
      expect(parseSearchQuery(value), value).toBeNull();
    }
  });

  it("truncates a very long query instead of running it", () => {
    const long = "a".repeat(10_000);
    const parsed = parseSearchQuery(long);

    expect(parsed).not.toBeNull();
    expect(parsed!.length).toBe(MAX_SEARCH_LENGTH);
  });

  it("does not mistake a long run of whitespace for a long query", () => {
    // Collapsed before measuring: " a          b " is a two-word search.
    expect(parseSearchQuery(`a${" ".repeat(500)}b`)).toBe("a b");
  });

  it("keeps a query that has something to match", () => {
    expect(parseSearchQuery("  project   management  ")).toBe(
      "project management"
    );
  });

  it("keeps punctuation that websearch syntax gives meaning to", () => {
    // Quoted phrases and -exclusion are things a visitor reasonably types, and
    // websearch_to_tsquery understands both. Stripping them here would silently
    // change what was asked for.
    expect(parseSearchQuery('"task manager" -mobile')).toBe(
      '"task manager" -mobile'
    );
  });

  it("keeps queries in scripts other than Latin", () => {
    // The directory lists products with names in more alphabets than one, and a
    // /[a-z0-9]/ emptiness test would reject every one of them.
    expect(parseSearchQuery("日本語")).toBe("日本語");
    expect(parseSearchQuery("Привет")).toBe("Привет");
    expect(parseSearchQuery("مرحبا")).toBe("مرحبا");
  });

  it("returns null for values that are not strings", () => {
    for (const value of [42, {}, [], ["query"], true]) {
      expect(parseSearchQuery(value)).toBeNull();
    }
  });
});
