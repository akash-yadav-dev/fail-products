// src/domain/referral/attribution.ts
/**
 * What a referral click is, and how long any of it is kept (ADR-018).
 *
 * Domain code imports nothing from Next.js, React, or any provider.
 *
 * The MVP metric is **outbound clicks from FailProducts**, and nothing else.
 * `docs/PRODUCT.md` §5 is explicit that this must never be presented as the
 * product's traffic: it is the count of people who left this site for that one,
 * which is a number this site can honestly know. Total traffic is a claim only
 * a connected analytics source can support (ADR-010).
 */

/**
 * How long a raw click row lives.
 *
 * `referral_events` is the fastest-growing table in the schema — one row per
 * outbound click, forever, on a database whose free tier is half a gigabyte.
 * Thirty days is long enough to investigate an abuse pattern or correct a
 * miscount, and short enough that the table has a ceiling.
 *
 * The aggregates outlive it, which is the whole trade: the daily rollup is
 * what a founder's dashboard reads, and it is kept indefinitely because a
 * row per product per day grows at a rate the database will not notice.
 */
export const REFERRAL_RAW_RETENTION_DAYS = 30;

/** A day, as the rollup keys it: `YYYY-MM-DD` in UTC. */
export type ReferralDay = string;

/**
 * The UTC day a click belongs to.
 *
 * UTC rather than a local zone, and stated rather than implied: a rollup keyed
 * by the server's local day would silently re-bucket every row the first time
 * this runs in a different region, and the aggregate is the only copy that
 * survives the prune.
 */
export function referralDayOf(at: Date): ReferralDay {
  return at.toISOString().slice(0, 10);
}

/** The half-open UTC range `[start, end)` covering one day. */
export function referralDayRange(day: ReferralDay): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`Not a referral day: ${day}`);
  }

  const start = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Not a referral day: ${day}`);
  }

  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** The instant before which raw rows may be deleted. */
export function referralPruneHorizon(now: Date): Date {
  return new Date(
    now.getTime() - REFERRAL_RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
}
