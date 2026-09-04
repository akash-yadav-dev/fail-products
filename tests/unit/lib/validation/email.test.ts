import { describe, expect, it } from "vitest";

import {
  MAX_EMAIL_LENGTH,
  isValidEmail,
  normalizeEmail,
  parseEmailAddress,
} from "@/lib/validation/email";

/**
 * The one email rule, shared by sign-in and the waitlist.
 *
 * The rule is deliberately permissive — the only proof an address exists is
 * sending to it — so these pin the boundary it does draw, not an attempt at
 * RFC 5321.
 */

describe("normalizeEmail", () => {
  it("trims and lowercases, so one mailbox is one row", () => {
    expect(normalizeEmail("  Founder@Example.test ")).toBe(
      "founder@example.test"
    );
  });
});

describe("isValidEmail", () => {
  it("accepts an ordinary address", () => {
    expect(isValidEmail("founder@example.test")).toBe(true);
  });

  it("rejects a string with no @", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("rejects a domain with no dot", () => {
    expect(isValidEmail("founder@localhost")).toBe(false);
  });

  it("rejects whitespace inside the address", () => {
    expect(isValidEmail("foun der@example.test")).toBe(false);
  });

  it("rejects an address longer than the column", () => {
    const local = "a".repeat(MAX_EMAIL_LENGTH);
    expect(isValidEmail(`${local}@example.test`)).toBe(false);
  });
});

describe("parseEmailAddress", () => {
  it("returns the normalised address, so the checked value is the stored one", () => {
    // The property that matters: a caller cannot validate one string and then
    // store a different one, because only one string comes back.
    expect(parseEmailAddress("  Founder@Example.test ")).toEqual({
      ok: true,
      email: "founder@example.test",
    });
  });

  it("rejects a non-string, which is what an absent form field is", () => {
    expect(parseEmailAddress(null)).toEqual({
      ok: false,
      reason: "INVALID_EMAIL",
    });
    expect(parseEmailAddress(undefined)).toEqual({
      ok: false,
      reason: "INVALID_EMAIL",
    });
  });

  it("rejects an address that is only whitespace", () => {
    expect(parseEmailAddress("   ")).toEqual({
      ok: false,
      reason: "INVALID_EMAIL",
    });
  });
});
