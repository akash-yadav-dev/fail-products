// src/repositories/referral-repository.ts
import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { referralDaily, referralEvents } from "@/db/schema";
import type { ReferralDay } from "@/domain/referral/attribution";

/**
 * Referral persistence (ADR-018).
 *
 * Three jobs: record a click, collapse a day into the rollup, and delete raw
 * rows past the retention horizon. Everything a founder sees is read from the
 * rollup; nothing reads raw events at render time, which is the point of
 * having a rollup at all.
 */
export class ReferralRepository {
  constructor(private readonly db: Database) {}

  /** One click. Nothing about who clicked — see the schema for why. */
  async record(productId: string, now?: Date): Promise<void> {
    await this.db
      .insert(referralEvents)
      .values({ productId, ...(now ? { createdAt: now } : {}) });
  }

  /**
   * Collapses one UTC day of raw events into the rollup.
   *
   * `DO UPDATE SET clicks = EXCLUDED.clicks` — an assignment, never
   * `clicks + EXCLUDED.clicks`. The count is recomputed from the raw rows on
   * every run, so running this twice for one day produces the same number as
   * running it once. That property is the whole reason this is written as one
   * statement rather than a read followed by a write: an additive rollup, or a
   * non-atomic read-then-write on `neon-http` which cannot hold a transaction,
   * silently doubles every number a founder is shown.
   *
   * Returns how many product rows the day touched, so a caller can log
   * something truthful about what it did.
   */
  async rollUpDay(
    day: ReferralDay,
    range: { start: Date; end: Date }
  ): Promise<number> {
    const rows = await this.db
      .insert(referralDaily)
      .select(
        // Every column of `referral_daily`, in the order the table declares
        // them. Drizzle refuses an insert-select whose projection is not an
        // exact positional match -- it cannot name the columns for you, so a
        // shorter select would silently mean "put clicks in created_at".
        // Typecheck does not catch it; the database does.
        this.db
          .select({
            productId: referralEvents.productId,
            day: sql<string>`${day}::date`.as("day"),
            clicks: count().as("clicks"),
            createdAt: sql<Date>`now()`.as("created_at"),
            updatedAt: sql<Date>`now()`.as("updated_at"),
          })
          .from(referralEvents)
          .where(
            and(
              gte(referralEvents.createdAt, range.start),
              lt(referralEvents.createdAt, range.end)
            )
          )
          .groupBy(referralEvents.productId)
      )
      .onConflictDoUpdate({
        target: [referralDaily.productId, referralDaily.day],
        set: {
          clicks: sql`excluded.clicks`,
          updatedAt: new Date(),
        },
      })
      .returning({ productId: referralDaily.productId });

    return rows.length;
  }

  /** Deletes raw rows recorded before `horizon`. The rollup is untouched. */
  async pruneEventsBefore(horizon: Date): Promise<number> {
    const rows = await this.db
      .delete(referralEvents)
      .where(lt(referralEvents.createdAt, horizon))
      .returning({ id: referralEvents.id });

    return rows.length;
  }

  /** The distinct UTC days that still have raw rows, oldest first. */
  async daysWithEvents(limit = 60): Promise<ReferralDay[]> {
    const rows = await this.db
      .selectDistinct({
        day: sql<string>`(${referralEvents.createdAt} at time zone 'utc')::date`.as(
          "day"
        ),
      })
      .from(referralEvents)
      .orderBy(sql`1`)
      .limit(limit);

    return rows.map((row) => String(row.day).slice(0, 10));
  }

  /** One listing's daily counts, newest first. Bounded, like every list here. */
  async dailyForProduct(productId: string, limit = 30) {
    return this.db
      .select({
        day: referralDaily.day,
        clicks: referralDaily.clicks,
      })
      .from(referralDaily)
      .where(eq(referralDaily.productId, productId))
      .orderBy(desc(referralDaily.day))
      .limit(limit);
  }

  /**
   * Clicks per day summed across a set of listings, newest day first.
   *
   * The overview needs one series for the whole account, not one per listing,
   * and summing in Postgres keeps it one round trip and one bounded result
   * instead of a query per product.
   *
   * Reads the rollup, never `referral_events` -- which is the point of having
   * a rollup. Raw rows only exist for the last 30 days, so a dashboard that
   * counted them would quietly start reporting less as history aged out.
   */
  async dailyForProducts(productIds: readonly string[], days = 30) {
    if (productIds.length === 0) return [];

    return this.db
      .select({
        day: referralDaily.day,
        clicks: sql<number>`sum(${referralDaily.clicks})::int`,
      })
      .from(referralDaily)
      .where(inArray(referralDaily.productId, [...productIds]))
      .groupBy(referralDaily.day)
      .orderBy(desc(referralDaily.day))
      .limit(days);
  }

  /** Total clicks per listing for a set of products, read in one query. */
  async totalsByProduct(productIds: readonly string[]) {
    if (productIds.length === 0) return new Map<string, number>();

    const rows = await this.db
      .select({
        productId: referralDaily.productId,
        clicks: sql<number>`coalesce(sum(${referralDaily.clicks}), 0)::int`,
      })
      .from(referralDaily)
      // `inArray`, not an interpolated list. These ids come from the database
      // rather than a request, but a query that concatenates values is one
      // edit away from being a query that concatenates a request.
      .where(inArray(referralDaily.productId, [...productIds]))
      .groupBy(referralDaily.productId);

    return new Map(rows.map((row) => [row.productId, Number(row.clicks)]));
  }
}
