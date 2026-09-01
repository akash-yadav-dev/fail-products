// tests/unit/domain/user/username.test.ts
import { describe, expect, it } from "vitest";

import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  validateUsername,
} from "@/domain/user/username";

/**
 * A username is a public URL (`/u/[username]`), so it lives in the namespace
 * ADR-019 reserves words in and is far harder to change than a profile field.
 */

describe("validateUsername", () => {
  it.each(["ak", "akash", "akash-yadav", "a1", "user123", "a-b-c"])(
    "accepts %s",
    (input) => {
      expect(validateUsername(input).ok).toBe(true);
    }
  );

  it("preserves case for display and lowercases for uniqueness", () => {
    const result = validateUsername("AkashYadav");
    expect(result).toEqual({
      ok: true,
      username: "AkashYadav",
      lowercased: "akashyadav",
    });
  });

  it("treats two casings of a handle as the same handle", () => {
    // The unique index is on username_lower, and this supplies what it indexes.
    const a = validateUsername("Akash");
    const b = validateUsername("akash");
    expect(a.ok && b.ok && a.lowercased === b.lowercased).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(validateUsername("  akash  ")).toMatchObject({
      ok: true,
      username: "akash",
    });
  });

  it("rejects the empty string", () => {
    expect(validateUsername("")).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("rejects whitespace only as empty", () => {
    expect(validateUsername("   ")).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("rejects a single character", () => {
    expect(validateUsername("a")).toEqual({ ok: false, reason: "TOO_SHORT" });
  });

  it("accepts exactly the minimum length", () => {
    expect(validateUsername("a".repeat(USERNAME_MIN_LENGTH)).ok).toBe(true);
  });

  it("accepts exactly the maximum length", () => {
    expect(validateUsername("a".repeat(USERNAME_MAX_LENGTH)).ok).toBe(true);
  });

  it("rejects one character over the maximum", () => {
    expect(validateUsername("a".repeat(USERNAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: "TOO_LONG",
    });
  });

  it.each([
    ["akash yadav", "a space"],
    ["akash_yadav", "an underscore"],
    ["akash.yadav", "a dot"],
    ["akash@dev", "an at sign"],
    ["akash/yadav", "a slash"],
    ["akash%20", "an escape"],
    ["../etc", "a traversal attempt"],
  ])("rejects %s (%s)", (input) => {
    expect(validateUsername(input)).toEqual({
      ok: false,
      reason: "INVALID_CHARACTERS",
    });
  });

  it.each(["akаsh", "аkash", "café", "日本語", "🎉🎉"])(
    "rejects the non-ascii handle %s",
    (input) => {
      // Includes a Cyrillic "а" that renders identically to Latin "a" — an
      // impersonation vector no moderation queue catches reliably.
      expect(validateUsername(input)).toEqual({
        ok: false,
        reason: "INVALID_CHARACTERS",
      });
    }
  );

  it.each(["-akash", "akash-"])("rejects the edge hyphen in %s", (input) => {
    expect(validateUsername(input)).toEqual({ ok: false, reason: "EDGE_HYPHEN" });
  });

  it("rejects consecutive hyphens", () => {
    expect(validateUsername("akash--yadav")).toEqual({
      ok: false,
      reason: "CONSECUTIVE_HYPHENS",
    });
  });

  it.each(["admin", "support", "api", "dashboard", "settings", "failproducts"])(
    "rejects the reserved handle %s",
    (input) => {
      expect(validateUsername(input)).toEqual({ ok: false, reason: "RESERVED" });
    }
  );

  it("rejects a reserved handle in any casing", () => {
    // Reserving "admin" while allowing "Admin" reserves nothing.
    expect(validateUsername("Admin")).toEqual({ ok: false, reason: "RESERVED" });
    expect(validateUsername("ADMIN")).toEqual({ ok: false, reason: "RESERVED" });
  });

  it("checks length before characters", () => {
    // Otherwise a 400-character string is scanned by the regex before being
    // rejected for the reason that was obvious from its length.
    expect(validateUsername("!".repeat(USERNAME_MAX_LENGTH + 1)).ok).toBe(false);
    expect(validateUsername("!".repeat(USERNAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: "TOO_LONG",
    });
  });
});
