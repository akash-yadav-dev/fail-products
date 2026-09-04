// tests/integration/referral.test.ts
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";

import { products, referralDaily, referralEvents, users } from "@/db/schema";
import { ProductRepository } from "@/repositories/product-repository";
import { ReferralRepository } from "@/repositories/referral-repository";
import {
  referralDayOf,
  referralDayRange,
  REFERRAL_RAW_RETENTION_DAYS,
} from "@/domain/referral/attribution";
import {
  recordOutboundClick,
  runReferralMaintenance,
} from "@/services/referral/referral-service";
import { noDatabase, testDb, unique } from "./database";

/**
 * Referral events, the rollup, and the prune (ADR-018, slice 4.3).
 *
 * The two rules this file exists for are the ones the Phase 4 plan singles out:
 * the rollup must be idempotent, and the prune must not touch the aggregate.
 * Both are silent when they break — an additive rollup produces numbers that
 * look plausible and are double, and a prune that takes the rollup with it
 * destroys the only surviving copy.
 */

describe.skipIf(noDatabase)("referral tracking", () => {
  const db = noDatabase ? null : testDb();
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];

  async function account() {
    const handle = unique("ref");
    const [row] = await db!
      .insert(users)
      .values({
        username: handle,
        usernameLower: handle.toLowerCase(),
        email: `${handle}@example.test`,
      })
      .returning();

    createdUserIds.push(row!.id);
    return row!.id;
  }

  async function product(state: Partial<typeof products.$inferInsert> = {}) {
    const [row] = await db!
      .insert(products)
      .values({
        ownerId: await account(),
        slug: unique("ref-fixture"),
        name: "Referral fixture",
        websiteUrl: "https://example.test/app",
        failureStatus: "ABANDONED",
        publicationState: "PUBLISHED",
        moderationState: "NONE",
        publishedAt: new Date(),
        ...state,
      })
      .returning();

    createdProductIds.push(row!.id);
    return row!;
  }

  /** A click recorded at a chosen instant, bypassing the service clock. */
  async function clickAt(productId: string, at: Date) {
    await db!.insert(referralEvents).values({ productId, createdAt: at });
  }

  function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  afterAll(async () => {
    if (!db) return;
    if (createdProductIds.length) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  // -------------------------------------------------------------------------
  // Recording
  // -------------------------------------------------------------------------

  it("attributes a click to the listing the slug names", async () => {
    const listing = await product();
    const referrals = new ReferralRepository(db!);

    const result = await recordOutboundClick({
      referrals,
      products: new ProductRepository(db!),
      slug: listing.slug,
    });

    expect(result.productId).toBe(listing.id);

    const [row] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(referralEvents)
      .where(eq(referralEvents.productId, listing.id));

    expect(row!.total).toBe(1);
  });

  it("records nothing for a listing that is not public", async () => {
    // The hop must not become a way to reach, or to count, a listing the
    // directory is refusing to show.
    const hidden = await product({ moderationState: "HIDDEN" });
    const referrals = new ReferralRepository(db!);

    await expect(
      recordOutboundClick({
        referrals,
        products: new ProductRepository(db!),
        slug: hidden.slug,
      })
    ).rejects.toThrow();

    const [row] = await db!
      .select({ total: sql<number>`count(*)::int` })
      .from(referralEvents)
      .where(eq(referralEvents.productId, hidden.id));

    expect(row!.total).toBe(0);
  });

  // -------------------------------------------------------------------------
  // The rollup
  // -------------------------------------------------------------------------

  it("is idempotent: rolling one day up twice does not double it", async () => {
    // The bug that silently corrupts every number a founder sees. An additive
    // rollup produces a plausible total, and nothing about it looks wrong.
    const listing = await product();
    const referrals = new ReferralRepository(db!);
    const at = daysAgo(2);
    const day = referralDayOf(at);

    await clickAt(listing.id, at);
    await clickAt(listing.id, at);
    await clickAt(listing.id, at);

    await referrals.rollUpDay(day, referralDayRange(day));
    await referrals.rollUpDay(day, referralDayRange(day));
    await referrals.rollUpDay(day, referralDayRange(day));

    const [row] = await db!
      .select({ clicks: referralDaily.clicks })
      .from(referralDaily)
      .where(
        and(eq(referralDaily.productId, listing.id), eq(referralDaily.day, day))
      );

    expect(row!.clicks).toBe(3);
  });

  it("recounts rather than accumulates when a day gains a click", async () => {
    const listing = await product();
    const referrals = new ReferralRepository(db!);
    const at = daysAgo(3);
    const day = referralDayOf(at);

    await clickAt(listing.id, at);
    await referrals.rollUpDay(day, referralDayRange(day));

    await clickAt(listing.id, at);
    await referrals.rollUpDay(day, referralDayRange(day));

    const [row] = await db!
      .select({ clicks: referralDaily.clicks })
      .from(referralDaily)
      .where(
        and(eq(referralDaily.productId, listing.id), eq(referralDaily.day, day))
      );

    expect(row!.clicks).toBe(2);
  });

  it("keeps one listing's clicks out of another's bucket", async () => {
    const mine = await product();
    const theirs = await product();
    const referrals = new ReferralRepository(db!);
    const at = daysAgo(4);
    const day = referralDayOf(at);

    await clickAt(mine.id, at);
    await clickAt(theirs.id, at);
    await clickAt(theirs.id, at);

    await referrals.rollUpDay(day, referralDayRange(day));

    const rows = await db!
      .select({
        productId: referralDaily.productId,
        clicks: referralDaily.clicks,
      })
      .from(referralDaily)
      .where(
        and(
          inArray(referralDaily.productId, [mine.id, theirs.id]),
          eq(referralDaily.day, day)
        )
      );

    const byProduct = new Map(rows.map((r) => [r.productId, r.clicks]));
    expect(byProduct.get(mine.id)).toBe(1);
    expect(byProduct.get(theirs.id)).toBe(2);
  });

  // -------------------------------------------------------------------------
  // The prune
  // -------------------------------------------------------------------------

  it("deletes raw rows past the horizon and leaves the rollup standing", async () => {
    const listing = await product();
    const referrals = new ReferralRepository(db!);

    const old = daysAgo(REFERRAL_RAW_RETENTION_DAYS + 5);
    const recent = daysAgo(1);
    const oldDay = referralDayOf(old);

    await clickAt(listing.id, old);
    await clickAt(listing.id, old);
    await clickAt(listing.id, recent);

    await runReferralMaintenance({ referrals });

    // The aggregate for the pruned day survives, with the right number in it.
    const [aggregate] = await db!
      .select({ clicks: referralDaily.clicks })
      .from(referralDaily)
      .where(
        and(
          eq(referralDaily.productId, listing.id),
          eq(referralDaily.day, oldDay)
        )
      );

    expect(aggregate!.clicks).toBe(2);

    // The raw rows behind it are gone, and the recent one is not.
    const remaining = await db!
      .select({ createdAt: referralEvents.createdAt })
      .from(referralEvents)
      .where(eq(referralEvents.productId, listing.id));

    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.createdAt.getTime()).toBeGreaterThan(old.getTime());
  });

  it("rolls a day up before pruning it, so no count is lost", async () => {
    // The ordering, proved end to end rather than only against a fake: a day
    // that is entirely past the horizon must still reach the rollup.
    const listing = await product();
    const referrals = new ReferralRepository(db!);
    const old = daysAgo(REFERRAL_RAW_RETENTION_DAYS + 10);
    const day = referralDayOf(old);

    await clickAt(listing.id, old);
    await clickAt(listing.id, old);

    await runReferralMaintenance({ referrals });

    const [row] = await db!
      .select({ clicks: referralDaily.clicks })
      .from(referralDaily)
      .where(
        and(eq(referralDaily.productId, listing.id), eq(referralDaily.day, day))
      );

    expect(row!.clicks).toBe(2);

    const leftover = await db!
      .select({ id: referralEvents.id })
      .from(referralEvents)
      .where(eq(referralEvents.productId, listing.id));

    expect(leftover).toHaveLength(0);
  });

  it("reports totals per listing from the rollup, never from raw rows", async () => {
    const listing = await product();
    const referrals = new ReferralRepository(db!);

    await clickAt(listing.id, daysAgo(2));
    await clickAt(listing.id, daysAgo(3));
    await clickAt(listing.id, daysAgo(3));

    await runReferralMaintenance({ referrals });

    const totals = await referrals.totalsByProduct([listing.id]);
    expect(totals.get(listing.id)).toBe(3);
  });

  it("deletes a listing's referral history with the listing", async () => {
    // Both tables cascade. The aggregate is about a product; with the product
    // gone there is nothing it describes.
    const listing = await product();
    const referrals = new ReferralRepository(db!);

    await clickAt(listing.id, daysAgo(2));
    await runReferralMaintenance({ referrals });

    await db!.delete(products).where(eq(products.id, listing.id));

    const events = await db!
      .select({ id: referralEvents.id })
      .from(referralEvents)
      .where(eq(referralEvents.productId, listing.id));
    const daily = await db!
      .select({ day: referralDaily.day })
      .from(referralDaily)
      .where(eq(referralDaily.productId, listing.id));

    expect(events).toHaveLength(0);
    expect(daily).toHaveLength(0);
  });
});
