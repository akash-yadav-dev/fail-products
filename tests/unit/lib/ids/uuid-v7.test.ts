// tests/unit/lib/ids/uuid-v7.test.ts
import { describe, expect, it } from "vitest";

import { uuidv7, uuidv7Timestamp } from "@/lib/ids/uuid-v7";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidv7", () => {
  it("produces a canonical UUID string", () => {
    expect(uuidv7()).toMatch(UUID_SHAPE);
  });

  it("sets the version nibble to 7", () => {
    // The character after the second dash group is the version.
    expect(uuidv7().charAt(14)).toBe("7");
  });

  it("sets the RFC 9562 variant bits", () => {
    expect(["8", "9", "a", "b"]).toContain(uuidv7().charAt(19));
  });

  it("does not repeat within the same millisecond", () => {
    const ids = new Set(
      Array.from({ length: 1000 }, () => uuidv7(1_700_000_000_000))
    );

    expect(ids.size).toBe(1000);
  });

  it("sorts lexicographically in creation order", () => {
    // This is the property the index depends on, and the reason for v7.
    const early = uuidv7(1_700_000_000_000);
    const later = uuidv7(1_700_000_000_001);
    const muchLater = uuidv7(1_900_000_000_000);

    expect([muchLater, early, later].sort()).toEqual([
      early,
      later,
      muchLater,
    ]);
  });

  it("encodes the timestamp it was given", () => {
    expect(uuidv7Timestamp(uuidv7(1_700_000_000_000))).toBe(1_700_000_000_000);
  });

  it("encodes the epoch", () => {
    expect(uuidv7Timestamp(uuidv7(0))).toBe(0);
  });

  it("rejects a negative timestamp", () => {
    expect(() => uuidv7(-1)).toThrowError(/non-negative integer/);
  });

  it("rejects a fractional timestamp", () => {
    expect(() => uuidv7(1.5)).toThrowError(/non-negative integer/);
  });
});

describe("uuidv7Timestamp", () => {
  it("rejects a string that is not a UUID", () => {
    expect(() => uuidv7Timestamp("not-a-uuid")).toThrowError(/Not a UUID/);
  });

  it("rejects an empty string", () => {
    expect(() => uuidv7Timestamp("")).toThrowError(/Not a UUID/);
  });
});
