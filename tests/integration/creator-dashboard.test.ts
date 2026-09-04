// tests/integration/creator-dashboard.test.ts
import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";

import { products, referralEvents, users } from "@/db/schema";
import { CommentRepository } from "@/repositories/comment-repository";
import { ReferralRepository } from "@/repositories/referral-repository";
import { runReferralMaintenance } from "@/services/referral/referral-service";
import { noDatabase, testDb, unique } from "./database";

/**
 * The numbers on the creator overview (slice 4.4).
 *
 * Two rules the Phase 4 plan names, and one this file adds because it is the
 * same class of mistake: the overview must read the rollup rather than raw
 * events, an owner must see only their own listings, and a total must match
 * what is actually in the table.
 *
 * The rollup rule is the one that fails silently. Counting `referral_events`
 * gives the right answer for a month and then quietly starts shrinking, because
 * raw rows are pruned at 30 days (ADR-018) while the aggregate is kept.
 */

describe.skipIf(noDatabase)("creator overview", () => {
  const db = noDatabase ? null : testDb();
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];

  async function account() {
    const handle = unique("dash");
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

  async function product(ownerId: string) {
    const [row] = await db!
      .insert(products)
      .values({
        ownerId,
        slug: unique("dash-fixture"),
        name: "Dashboard fixture",
        websiteUrl: "https://example.test/app",
        failureStatus: "ABANDONED",
        publicationState: "PUBLISHED",
        moderationState: "NONE",
        publishedAt: new Date(),
      })
      .returning();

    createdProductIds.push(row!.id);
    return row!;
  }

  async function clickAt(productId: string, daysAgo: number) {
    await db!.insert(referralEvents).values({
      productId,
      createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    });
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

  it("totals match the rollup for a seeded fixture", async () => {
    const owner = await account();
    const first = await product(owner);
    const second = await product(owner);
    const referrals = new ReferralRepository(db!);

    await clickAt(first.id, 2);
    await clickAt(first.id, 2);
    await clickAt(second.id, 3);

    await runReferralMaintenance({ referrals });

    const totals = await referrals.totalsByProduct([first.id, second.id]);

    expect(totals.get(first.id)).toBe(2);
    expect(totals.get(second.id)).toBe(1);
    expect([...totals.values()].reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("keeps one owner's numbers out of another's", async () => {
    const mine = await account();
    const theirs = await account();
    const myListing = await product(mine);
    const theirListing = await product(theirs);
    const referrals = new ReferralRepository(db!);

    await clickAt(myListing.id, 1);
    await clickAt(theirListing.id, 1);
    await clickAt(theirListing.id, 1);
    await clickAt(theirListing.id, 1);

    await runReferralMaintenance({ referrals });

    // The overview passes only the ids it owns. Nothing else may appear.
    const totals = await referrals.totalsByProduct([myListing.id]);

    expect(totals.get(myListing.id)).toBe(1);
    expect(totals.has(theirListing.id)).toBe(false);
  });

  it("still reports clicks after the raw rows behind them are pruned", async () => {
    // The failure that would take a month to notice. An overview reading
    // `referral_events` is correct until the prune runs, then silently reports
    // less every day while the rollup it should have read stays right.
    const owner = await account();
    const listing = await product(owner);
    const referrals = new ReferralRepository(db!);

    await clickAt(listing.id, 45);
    await clickAt(listing.id, 45);

    await runReferralMaintenance({ referrals });

    const raw = await db!
      .select({ id: referralEvents.id })
      .from(referralEvents)
      .where(inArray(referralEvents.productId, [listing.id]));

    expect(raw).toHaveLength(0);

    const totals = await referrals.totalsByProduct([listing.id]);
    expect(totals.get(listing.id)).toBe(2);
  });

  it("reports a daily series across all of one owner's listings", async () => {
    const owner = await account();
    const first = await product(owner);
    const second = await product(owner);
    const referrals = new ReferralRepository(db!);

    // Two listings, same day: the series sums them rather than listing the day
    // twice.
    await clickAt(first.id, 5);
    await clickAt(second.id, 5);
    await clickAt(first.id, 6);

    await runReferralMaintenance({ referrals });

    const series = await referrals.dailyForProducts([first.id, second.id], 30);
    const days = series.map((entry) => entry.day);

    expect(new Set(days).size).toBe(days.length);
    expect(series.reduce((total, entry) => total + entry.clicks, 0)).toBe(3);
  });

  it("answers zero for an account with no listings at all", async () => {
    // The empty case is the one every new founder sees first, and an empty
    // `IN ()` is a SQL syntax error rather than an empty result.
    const referrals = new ReferralRepository(db!);
    const comments = new CommentRepository(db!);

    expect((await referrals.totalsByProduct([])).size).toBe(0);
    expect(await referrals.dailyForProducts([], 30)).toEqual([]);
    expect(await comments.countPublicByProducts([])).toBe(0);
  });
});
