// src/repositories/rate-limit-repository.ts
import { sql } from "drizzle-orm";

import type { Database } from "@/db";
import { rateLimits } from "@/db/schema";

/**
 * The counted rate-limit layer (ADR-017).
 *
 * One table for every counted limit in the application. Which limit a row
 * belongs to is carried in the hashed key, so adding a limit needs no
 * migration and two limits can never share a counter.
 *
 * The count is maintained by a single `INSERT … ON CONFLICT DO UPDATE`, which
 * is what makes it accurate under concurrency: read-then-write would let two
 * simultaneous requests both observe `count = limit - 1` and both be allowed.
 * `neon-http` issues each query as its own HTTP request and cannot hold an
 * interactive transaction, so a statement that is atomic on its own is not a
 * stylistic preference here — it is the only correct option available.
 */

/** No rule may exceed this. The sweep below relies on it. */
export const MAX_RATE_LIMIT_WINDOW_SECONDS = 24 * 60 * 60;

export type RateLimitScope = "EMAIL" | "IP" | "USER";

export type RateLimitConsumption = {
  allowed: boolean;
  remaining: number;
  /** Epoch milliseconds. */
  resetAt: number;
};

/**
 * How often the sweep actually runs, as a fraction of calls.
 *
 * The sweep is time-based work — it deletes counters older than a fixed
 * 24-hour horizon — but it used to be issued on every `consume()`, before the
 * upsert. neon-http sends each statement as its own HTTPS request, so that
 * doubled the round trips of every comment, every report, and every sign-in
 * attempt to keep a bounded table tidy to a precision nothing needs.
 *
 * One call in a hundred still clears the table far faster than rows reach the
 * horizon, and the sweep's correctness never depended on running often: it
 * deletes what no live window can be using, so running it late deletes exactly
 * the same rows.
 */
const SWEEP_SAMPLE_RATE = 0.01;

export class RateLimitRepository {
  constructor(
    private readonly db: Database,
    /**
     * Whether this call should also sweep. Injectable so a test can force it
     * either way rather than retrying until chance obliges.
     */
    private readonly shouldSweep: () => boolean = () =>
      Math.random() < SWEEP_SAMPLE_RATE
  ) {}

  /**
   * Counts one request against a limit and says whether it is allowed.
   *
   * The sweep at the top deletes counters no live window can still be using.
   * It is deliberately **not** scoped to this rule's window: the table is
   * shared, and deleting everything older than the caller's own window would
   * let a fifteen-minute rule reset an hour-long rule's counter — which reads
   * as a rate limit that a second, unrelated endpoint can be used to bypass.
   * `MAX_RATE_LIMIT_WINDOW_SECONDS` is the horizon nothing can outlive, and
   * `rate_limits_updated_at_idx` is what keeps the sweep off a table scan.
   */
  async consume(input: {
    scope: RateLimitScope;
    keyHash: string;
    limit: number;
    windowSeconds: number;
    now: number;
  }): Promise<RateLimitConsumption> {
    if (input.windowSeconds > MAX_RATE_LIMIT_WINDOW_SECONDS) {
      throw new Error(
        `Rate limit window exceeds the sweep horizon: ${input.windowSeconds}s`
      );
    }

    const nowDate = new Date(input.now);
    const windowStart = new Date(input.now - input.windowSeconds * 1000);
    const sweepBefore = new Date(
      input.now - MAX_RATE_LIMIT_WINDOW_SECONDS * 1000
    );
    const expired = sql`${rateLimits.windowStartedAt} <= ${windowStart}`;

    if (this.shouldSweep()) {
      await this.db
        .delete(rateLimits)
        .where(sql`${rateLimits.updatedAt} <= ${sweepBefore}`);
    }

    const [row] = await this.db
      .insert(rateLimits)
      .values({
        scope: input.scope,
        keyHash: input.keyHash,
        windowStartedAt: nowDate,
        count: 1,
      })
      .onConflictDoUpdate({
        target: [rateLimits.scope, rateLimits.keyHash],
        set: {
          count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
          windowStartedAt: sql`CASE WHEN ${expired} THEN ${nowDate} ELSE ${rateLimits.windowStartedAt} END`,
          updatedAt: nowDate,
        },
      })
      .returning({
        count: rateLimits.count,
        windowStartedAt: rateLimits.windowStartedAt,
      });

    // No row back means the write did not land. Denying is the only safe
    // reading: a limiter that fails open is not a limiter.
    if (!row) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: input.now + input.windowSeconds * 1000,
      };
    }

    const resetAt =
      row.windowStartedAt.getTime() + input.windowSeconds * 1000;

    return {
      allowed: row.count <= input.limit,
      remaining: Math.max(0, input.limit - row.count),
      resetAt,
    };
  }

  /** Clears one counter. Used by tests and by an operator undoing a lockout. */
  async reset(scope: RateLimitScope, keyHash: string): Promise<void> {
    await this.db
      .delete(rateLimits)
      .where(
        sql`${rateLimits.scope} = ${scope} AND ${rateLimits.keyHash} = ${keyHash}`
      );
  }
}
