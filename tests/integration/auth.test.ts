import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { authTokens, rateLimits, users } from "@/db/schema";
import { requestEmailCode, verifyEmailCode } from "@/services/auth/auth-service";
import { AuthRepository } from "@/repositories/auth-repository";
import { sha256Base64Url } from "@/lib/auth/crypto";
import { noDatabase, testDb, unique } from "./database";

describe.skipIf(noDatabase)("passwordless authentication", () => {
  let db: ReturnType<typeof testDb>;
  let repository!: AuthRepository;
  const email = `${unique("auth")}@example.test`;
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  let code = "";

  beforeAll(() => {
    if (!noDatabase) { db = testDb(); repository = new AuthRepository(db); }
  });

  it("sends a generic response and stores only a hashed code", async () => {
    const result = await requestEmailCode({
      repository,
      email,
      ipAddress: ip,
      generateCode: () => "123456",
      sendOtp: async (input) => {
        code = input.code;
      },
    });
    expect(result).toEqual({ ok: true });
    const [row] = await db!
      .select({ tokenHash: authTokens.tokenHash, consumedAt: authTokens.consumedAt })
      .from(authTokens)
      .where(eq(authTokens.email, email));
    expect(code).toBe("123456");
    expect(row?.tokenHash).toBe(await sha256Base64Url(code));
    expect(row?.tokenHash).not.toBe(code);
    expect(row?.consumedAt).toBeNull();
  });

  it("allows exactly one concurrent redemption", async () => {
    const results = await Promise.all([
      verifyEmailCode({ repository, email, code, ipAddress: `${ip}-a` }),
      verifyEmailCode({ repository, email, code, ipAddress: `${ip}-b` }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
  });

  it("rejects an expired code", async () => {
    const expiredEmail = `${unique("expired")}@example.test`;
    await requestEmailCode({
      repository,
      email: expiredEmail,
      ipAddress: `${ip}-expired`,
      now: 1_000,
      generateCode: () => "654321",
      sendOtp: async () => undefined,
    });
    const result = await verifyEmailCode({
      repository,
      email: expiredEmail,
      code: "654321",
      ipAddress: `${ip}-expired`,
      now: 1_000 + 10 * 60 * 1000,
    });
    expect(result).toEqual({ ok: false, reason: "invalid-code" });
    await db!.delete(authTokens).where(eq(authTokens.email, expiredEmail));
  });

  it("counts requests per email and per IP", async () => {
    const limitedEmail = `${unique("limited")}@example.test`;
    const limitedIp = `${ip}-limited`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await requestEmailCode({
        repository,
        email: limitedEmail,
        ipAddress: limitedIp,
        generateCode: () => String(attempt).padStart(6, "0"),
        sendOtp: async () => undefined,
      });
    }
    const blocked = await requestEmailCode({
      repository,
      email: limitedEmail,
      ipAddress: limitedIp,
      sendOtp: async () => undefined,
    });
    expect(blocked).toEqual({ ok: false, reason: "rate-limited" });
    await db!.delete(authTokens).where(eq(authTokens.email, limitedEmail));
  });

  it("cleans up fixtures", async () => {
    await db!.delete(authTokens).where(eq(authTokens.email, email));
    await db!.delete(users).where(eq(users.email, email));
    const hashes = await Promise.all([
      sha256Base64Url(`request-email:EMAIL:${email}`),
      sha256Base64Url(`request-ip:IP:${ip}`),
      sha256Base64Url(`verify-email:EMAIL:${email}`),
      sha256Base64Url(`verify-ip:IP:${ip}-a`),
      sha256Base64Url(`verify-ip:IP:${ip}-b`),
      sha256Base64Url(`request-email:EMAIL:${email}`),
      sha256Base64Url(`request-ip:IP:${ip}-expired`),
      sha256Base64Url(`verify-ip:IP:${ip}-expired`),
      sha256Base64Url(`request-ip:IP:${ip}-limited`),
    ]);
    for (const keyHash of hashes) await db!.delete(rateLimits).where(eq(rateLimits.keyHash, keyHash));
  });
});
