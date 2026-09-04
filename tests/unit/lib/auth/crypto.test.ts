import { describe, expect, it } from "vitest";

import {
  constantTimeEqual,
  generateOtp,
  generateSessionToken,
  sha256Base64Url,
} from "@/lib/auth/crypto";

// Email normalisation and validation moved to `lib/validation/email.ts` when
// the waitlist became a second caller; their tests moved with them, to
// tests/unit/lib/validation/email.test.ts.

describe("passwordless authentication primitives", () => {
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
