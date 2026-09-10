import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { authTokens, rateLimits, sessions, users } from "@/db/schema";
import { AuthRepository } from "@/repositories/auth-repository";
import { requestEmailCode, verifyEmailCode } from "@/services/auth/auth-service";
import { sha256Base64Url } from "@/lib/auth/crypto";
import { databaseUrl, noDatabase, testDb, unique } from "./database";

describe.skipIf(noDatabase)("auth performance without weakened validity", () => {
  it("creates the first email session without rereading the inserted user", async () => {
    const queries: string[] = [];
    const db = drizzle(neon(databaseUrl!), { schema, logger: {
      logQuery(query) { queries.push(query); },
    } });
    const repository = new AuthRepository(db);
    const email = `${unique("perf-auth")}@example.test`;
    const ipAddress = unique("perf-ip");
    try {
      await requestEmailCode({ repository, email, ipAddress, generateCode: () => "412578", sendOtp: async () => {} });
      queries.length = 0;
      const result = await verifyEmailCode({ repository, email, ipAddress, code: "412578" });
      expect(result.ok).toBe(true);
      // A performance budget over actual SQL, not a mocked repository call count.
      expect(queries.filter(query => query.startsWith('select ') && query.includes('from "users"'))).toHaveLength(1);
      if (result.ok) {
        const [session] = await repository.findSessionUser(
          await sha256Base64Url(result.sessionToken), Date.now());
        expect(session.userId).toBe(result.userId);
      }
    } finally {
      await db.delete(authTokens).where(eq(authTokens.email, email));
      await db.delete(users).where(eq(users.email, email));
      const keys = await Promise.all([
        `request-email:EMAIL:${email}`, `verify-email:EMAIL:${email}`,
        `request-ip:IP:${ipAddress}`, `verify-ip:IP:${ipAddress}`,
      ].map(sha256Base64Url));
      await db.delete(rateLimits).where(inArray(rateLimits.keyHash, keys));
    }
  });

  it("cleans expired and consumed credentials while retaining live credentials", async () => {
    const db = testDb();
    const repository = new AuthRepository(db);
    const email = `${unique("perf-cleanup")}@example.test`;
    const now = Date.now();
    const [owner] = await db.insert(users).values({ email }).returning({ id: users.id });
    const tokens = await db.insert(authTokens).values([
      { email, tokenHash: unique("live"), expiresAt: new Date(now + 600000) },
      { email, tokenHash: unique("expired"), expiresAt: new Date(now - 1000) },
      { email, tokenHash: unique("consumed"), expiresAt: new Date(now + 600000), consumedAt: new Date(now - 1000) },
    ]).returning({ id: authTokens.id });
    const sessionRows = await db.insert(sessions).values([
      { userId: owner.id, tokenHash: unique("live-session"), expiresAt: new Date(now + 600000) },
      { userId: owner.id, tokenHash: unique("expired-session"), expiresAt: new Date(now - 1000) },
      { userId: owner.id, tokenHash: unique("revoked-session"), expiresAt: new Date(now + 600000), revokedAt: new Date(now - 1000) },
    ]).returning({ id: sessions.id });
    try {
      // Shared housekeeping can encounter older fixtures first; every pass is
      // still bounded to 100 candidates per table.
      for (let pass = 0; pass < 10; pass++) {
        await repository.cleanupAuthData(now);
        const remaining = await db.select({ id: authTokens.id }).from(authTokens).where(eq(authTokens.email, email));
        const liveSessions = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, owner.id));
        if (remaining.length === 1 && liveSessions.length === 1) break;
      }
      expect(await db.select({ id: authTokens.id }).from(authTokens).where(eq(authTokens.email, email)))
        .toEqual([tokens[0]]);
      expect(await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, owner.id)))
        .toEqual([sessionRows[0]]);
    } finally {
      await db.delete(authTokens).where(inArray(authTokens.id, tokens.map(row => row.id)));
      await db.delete(users).where(eq(users.id, owner.id));
    }
  });
});
