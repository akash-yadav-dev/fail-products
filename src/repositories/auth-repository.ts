import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { authAccounts, authTokens, sessions, users } from "@/db/schema";
import {
  RateLimitRepository,
  type RateLimitScope,
} from "@/repositories/rate-limit-repository";

export class AuthRepository {
  private readonly limits: RateLimitRepository;

  constructor(private readonly db: Database) {
    this.limits = new RateLimitRepository(db);
  }

  async cleanupAuthData(now: number) {
    const date = new Date(now);
    await this.db.delete(authTokens).where(sql`${authTokens.expiresAt} <= ${date} OR ${authTokens.consumedAt} IS NOT NULL`);
    await this.db.delete(sessions).where(sql`${sessions.expiresAt} <= ${date} OR ${sessions.revokedAt} IS NOT NULL`);
  }

  /**
   * Auth's counted limits, on the application-wide counter table.
   *
   * Auth used to own a table of its own, `auth_rate_limits`. It was the same
   * shape as this one and there is only one counting algorithm worth having,
   * so Phase 3 folded it in (migrations 0008 and 0009) rather than write a
   * second copy for comments and reports. The forwarding keeps the auth
   * service's dependency unchanged: it already holds this repository.
   */
  consumeRateLimit(input: {
    scope: RateLimitScope;
    keyHash: string;
    limit: number;
    windowSeconds: number;
    now: number;
  }) {
    return this.limits.consume(input);
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
