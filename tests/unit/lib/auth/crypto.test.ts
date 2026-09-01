import { describe, expect, it } from "vitest";

import {
  constantTimeEqual,
  generateOtp,
  generateSessionToken,
  isValidEmail,
  normalizeEmail,
  sha256Base64Url,
} from "@/lib/auth/crypto";

describe("passwordless authentication primitives", () => {
  it("normalizes and validates email addresses at the boundary", () => {
    expect(normalizeEmail("  Founder@Example.test ")).toBe("founder@example.test");
    expect(isValidEmail("founder@example.test")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("generates six-digit OTPs", () => {
    const code = generateOtp();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("generates opaque session tokens", () => {
    const token = generateSessionToken();
    expect(token.length).toBeGreaterThan(32);
    expect(generateSessionToken()).not.toBe(token);
  });

  it("hashes tokens and compares hashes in constant-time", async () => {
    const hash = await sha256Base64Url("secret");
    expect(hash).not.toContain("secret");
    expect(constantTimeEqual(hash, await sha256Base64Url("secret"))).toBe(true);
    expect(constantTimeEqual(hash, await sha256Base64Url("other"))).toBe(false);
  });
});
