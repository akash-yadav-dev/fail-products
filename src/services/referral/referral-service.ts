// src/services/referral/referral-service.ts
import {
  referralDayOf,
  referralDayRange,
  referralPruneHorizon,
  type ReferralDay,
} from "@/domain/referral/attribution";
import type { ReferralRepository } from "@/repositories/referral-repository";

/**
 * Referral use cases (ADR-018), free of Next.js and of `getDb`.
 *
 * Two of the three are maintenance rather than request handling, and they are
 * written as ordinary functions behind this interface for the reason
 * `docs/ARCHITECTURE.md` §9 gives: the trigger mechanism will change. Today
 * they are invoked by a script; when there is a deployment they become a
 * Cloudflare Cron Trigger, and nothing here has to know which.
 */

export class ReferralError extends Error {
  constructor(readonly code: "TARGET_NOT_FOUND") {
    super(code);
    this.name = "ReferralError";
  }
}

/**
 * Records one outbound click and returns where to send the visitor.
 *
 * The destination is re-read from the database rather than taken from the
 * request. That is what stops this becoming an open redirect: the only URLs it
 * can send anyone to are ones a founder published on their own listing, and the
 * only listings it will resolve are publicly visible ones — so a hidden or
 * removed product cannot be used as a redirector either.
 *
 * **Recording never decides whether the visitor travels.** If the counter
 * cannot be written, the redirect still happens. A person clicking a link is
 * not interested in our analytics, and a failed insert is not a reason to show
 * them an error page.
 */
export async function recordOutboundClick(input: {
  referrals: ReferralRepository;
  products: {
    findPublicBySlug(slug: string): Promise<{
      id: string;
      websiteUrl: string | null;
    } | null>;
  };
  slug: string;
  now?: Date;
}): Promise<{ productId: string; websiteUrl: string | null }> {
  const product = await input.products.findPublicBySlug(input.slug);
  if (!product) throw new ReferralError("TARGET_NOT_FOUND");

  try {
    await input.referrals.record(product.id, input.now);
  } catch {
    // Counted or not, the visitor goes where they were going.
  }

  return { productId: product.id, websiteUrl: product.websiteUrl };
}

/**
 * Collapses raw events into the daily rollup, then deletes what has aged out.
 *
 * **The order is the whole safety property.** Rolling up before pruning means a
 * day is aggregated while its raw rows still exist; pruning first would delete
 * the only copy of numbers that had never been summed. Written as one function
 * for that reason — two separately scheduled jobs can run in the wrong order,
 * and this one cannot.
 *
 * Every day that still has raw rows is rolled up on each run, not just
 * yesterday. Re-rolling a day is free because the rollup assigns rather than
 * adds, and it means a run that was missed — a failed cron, a redeploy, an
 * outage — is repaired by the next one instead of leaving a permanent hole.
 */
export async function runReferralMaintenance(input: {
  referrals: ReferralRepository;
  now?: Date;
}): Promise<{ days: ReferralDay[]; rolledUp: number; pruned: number }> {
  const now = input.now ?? new Date();

  const days = await input.referrals.daysWithEvents();

  let rolledUp = 0;
  for (const day of days) {
    rolledUp += await input.referrals.rollUpDay(day, referralDayRange(day));
  }

  // Only after every day above is in the rollup.
  const pruned = await input.referrals.pruneEventsBefore(
    referralPruneHorizon(now)
  );

  return { days, rolledUp, pruned };
}

/** One listing's clicks per day, newest first, for the owner's dashboard. */
export async function referralHistory(input: {
  referrals: ReferralRepository;
  productId: string;
  days?: number;
}) {
  return input.referrals.dailyForProduct(input.productId, input.days ?? 30);
}

export { referralDayOf };
