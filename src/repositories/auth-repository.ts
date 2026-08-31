import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { authAccounts, authRateLimits, authTokens, sessions, users } from "@/db/schema";

export class AuthRepository {
  constructor(private readonly db: Database) {}

  async cleanupAuthData(now: number) {
    const date = new Date(now);
    await this.db.delete(authTokens).where(sql`${authTokens.expiresAt} <= ${date} OR ${authTokens.consumedAt} IS NOT NULL`);
    await this.db.delete(sessions).where(sql`${sessions.expiresAt} <= ${date} OR ${sessions.revokedAt} IS NOT NULL`);
  }

  async consumeRateLimit(input: {
    scope: "EMAIL" | "IP";
    keyHash: string;
    limit: number;
    windowSeconds: number;
    now: number;
  }) {
    const nowDate = new Date(input.now);
    const windowStart = new Date(input.now - input.windowSeconds * 1000);
    const expired = sql`${authRateLimits.windowStartedAt} <= ${windowStart}`;
    await this.db
      .delete(authRateLimits)
      .where(sql`${authRateLimits.updatedAt} <= ${windowStart}`);
    const [row] = await this.db
      .insert(authRateLimits)
      .values({
        scope: input.scope,
        keyHash: input.keyHash,
        windowStartedAt: nowDate,
        count: 1,
      })
      .onConflictDoUpdate({
        target: [authRateLimits.scope, authRateLimits.keyHash],
        set: {
          count: sql`CASE WHEN ${expired} THEN 1 ELSE ${authRateLimits.count} + 1 END`,
          windowStartedAt: sql`CASE WHEN ${expired} THEN ${nowDate} ELSE ${authRateLimits.windowStartedAt} END`,
          updatedAt: nowDate,
        },
      })
      .returning({ count: authRateLimits.count, windowStartedAt: authRateLimits.windowStartedAt });
    if (!row) return { allowed: false, remaining: 0, resetAt: input.now + input.windowSeconds * 1000 };
    const resetAt = row.windowStartedAt.getTime() + input.windowSeconds * 1000;
    return { allowed: row.count <= input.limit, remaining: Math.max(0, input.limit - row.count), resetAt };
  }

  insertToken(input: { email: string; tokenHash: string; expiresAt: Date }) {
    return this.db.insert(authTokens).values(input);
  }

  findActiveTokens(email: string, now: number, maxAttempts: number) {
    return this.db
      .select({ id: authTokens.id, tokenHash: authTokens.tokenHash })
      .from(authTokens)
      .where(and(eq(authTokens.email, email), isNull(authTokens.consumedAt), gt(authTokens.expiresAt, new Date(now)), sql`${authTokens.attempts} < ${maxAttempts}`))
      .orderBy(desc(authTokens.createdAt))
      .limit(10);
  }

  incrementTokenAttempt(id: string, now: number, maxAttempts: number) {
    return this.db
      .update(authTokens)
      .set({ attempts: sql`${authTokens.attempts} + 1` })
      .where(and(eq(authTokens.id, id), isNull(authTokens.consumedAt), gt(authTokens.expiresAt, new Date(now)), sql`${authTokens.attempts} < ${maxAttempts}`));
  }

  consumeToken(id: string, now: number, maxAttempts: number) {
    return this.db
      .update(authTokens)
      .set({ consumedAt: new Date(now), attempts: sql`${authTokens.attempts} + 1` })
      .where(and(eq(authTokens.id, id), isNull(authTokens.consumedAt), gt(authTokens.expiresAt, new Date(now)), sql`${authTokens.attempts} < ${maxAttempts}`))
      .returning({ id: authTokens.id });
  }

  findUserByEmail(email: string) {
    return this.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  }

  createUser(input: { email: string | null; displayName?: string | null }) {
    return this.db.insert(users).values(input).onConflictDoNothing({ target: users.email });
  }

  createSession(input: { userId: string; tokenHash: string; expiresAt: Date; lastSeenAt: Date }) {
    return this.db.insert(sessions).values(input);
  }

  findSessionUser(tokenHash: string, now: number) {
    return this.db
      .select({ sessionId: sessions.id, userId: users.id, email: users.email })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date(now))))
      .limit(1);
  }

  revokeSession(tokenHash: string, now: number) {
    return this.db.update(sessions).set({ revokedAt: new Date(now), updatedAt: new Date(now) }).where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)));
  }

  findAuthAccount(provider: string, providerAccountId: string) {
    return this.db.select({ userId: authAccounts.userId }).from(authAccounts).where(and(eq(authAccounts.provider, provider), eq(authAccounts.providerAccountId, providerAccountId))).limit(1);
  }

  linkAuthAccount(input: { userId: string; provider: string; providerAccountId: string }) {
    return this.db.insert(authAccounts).values(input).onConflictDoNothing({ target: [authAccounts.provider, authAccounts.providerAccountId] }).returning({ userId: authAccounts.userId });
  }
}
