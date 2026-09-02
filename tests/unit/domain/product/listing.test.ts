// tests/unit/domain/product/listing.test.ts
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PRODUCT_SORT,
  MAX_PAGE_SIZE,
  PRODUCT_SORTS,
  decodeProductCursor,
  encodeProductCursor,
  isProductSort,
  parsePageSize,
  parseProductSort,
} from "@/domain/product/listing";

/**
 * The list parameters are all attacker-controlled: they arrive in a query
 * string on an unauthenticated page. Every test here is about what happens to a
 * value that is not one of the ones we meant to allow.
 */

describe("product sort allowlist", () => {
  it("accepts every sort it publishes", () => {
    for (const sort of PRODUCT_SORTS) {
      expect(isProductSort(sort.value)).toBe(true);
      expect(parseProductSort(sort.value)).toBe(sort.value);
    }
  });

  it("rejects anything not in the allowlist", () => {
    const rejected = [
      "oldest",
      "most-discussed",
      "most-referred",
      "NEWEST",
      " newest",
      "newest ",
      "published_at",
      "id; drop table products",
      "name) --",
      "",
    ];

    for (const value of rejected) {
      expect(isProductSort(value), value).toBe(false);
    }
  });

  it("rejects values that are not strings at all", () => {
    for (const value of [null, undefined, 1, {}, [], ["newest"], true]) {
      expect(isProductSort(value)).toBe(false);
    }
  });

  it("falls back to the default rather than throwing on a bad sort", () => {
    // A browse page with a stale bookmark should still render. The rejection
    // has already happened — what reaches the query is the default, never the
    // unknown value.
    expect(parseProductSort("nonsense")).toBe(DEFAULT_PRODUCT_SORT);
    expect(parseProductSort(undefined)).toBe(DEFAULT_PRODUCT_SORT);
    expect(parseProductSort(["newest"])).toBe(DEFAULT_PRODUCT_SORT);
  });

  it("does not yet publish the sorts that have no data source", () => {
    // docs/PRODUCT.md §5.1 lists four sorts. Phase 3 built the comments table,
    // so "most discussed" is now computable — and still absent, because this
    // list is keyset-paginated and a keyset needs a stored, ordered column
    // that an aggregate is not. Referral events are Phase 4 and do not exist
    // at all. This test is the reminder to add each one with the column that
    // makes it pageable, not with the table that makes it countable.
    const values = PRODUCT_SORTS.map((sort) => sort.value);
    expect(values).not.toContain("most-discussed");
    expect(values).not.toContain("most-referred");
  });
});

describe("page size", () => {
  it("defaults when nothing is asked for", () => {
    expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize(null)).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("")).toBe(DEFAULT_PAGE_SIZE);
  });

  it("clamps a request for the whole table", () => {
    // Unbounded reads are metered on Neon. `?limit=1000000` costs the sender
    // nothing and the project real money, so the ceiling is not negotiable.
    expect(parsePageSize(1_000_000)).toBe(MAX_PAGE_SIZE);
    expect(parsePageSize("1e9")).toBe(MAX_PAGE_SIZE);
  });

  it("rejects sizes that would produce an empty or backwards page", () => {
    expect(parsePageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize(-5)).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("abc")).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize(Number.NaN)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("truncates a fractional size instead of passing it to LIMIT", () => {
    expect(parsePageSize(12.9)).toBe(12);
  });
});

describe("cursors", () => {
  const id = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
  const sortedAt = new Date("2026-08-31T12:34:56.789Z");

  it("round-trips a position", () => {
    const encoded = encodeProductCursor({ sortedAt, id });
    const decoded = decodeProductCursor(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe(id);
    // Millisecond precision is kept: two products published in the same second
    // are ordinary, and losing the milliseconds would merge their positions.
    expect(decoded!.sortedAt.getTime()).toBe(sortedAt.getTime());
  });

  it("returns null for anything malformed", () => {
    const malformed = [
      "",
      "not-a-cursor",
      String(sortedAt.getTime()),
      id,
      `${sortedAt.getTime()}.not-a-uuid`,
      `abc.${id}`,
      // A uuid with a capital letter is not the form the database emits, and
      // accepting one would let two spellings of the same cursor exist.
      `${sortedAt.getTime()}.${id.toUpperCase()}`,
      // Digit count is bounded so the number cannot be pushed past Date's range.
      `9999999999999999999999.${id}`,
      `${sortedAt.getTime()}.${id}' OR 1=1--`,
    ];

    for (const value of malformed) {
      expect(decodeProductCursor(value), value).toBeNull();
    }
  });

  it("returns null for values that are not strings", () => {
    for (const value of [null, undefined, 42, {}, [sortedAt.getTime(), id]]) {
      expect(decodeProductCursor(value)).toBeNull();
    }
  });

  it("tolerates surrounding whitespace from a hand-edited URL", () => {
    const encoded = encodeProductCursor({ sortedAt, id });
    expect(decodeProductCursor(`  ${encoded}  `)?.id).toBe(id);
  });
});
