// tests/unit/services/referral/referral-service.test.ts
import { describe, expect, it, vi } from "vitest";

import {
  recordOutboundClick,
  ReferralError,
  runReferralMaintenance,
} from "@/services/referral/referral-service";

/**
 * Attribution and the maintenance order (ADR-018 slice 4.3).
 *
 * Fakes rather than a database: what is under test here is which product a
 * click is attributed to, what happens when the slug names nothing, and that
 * the rollup runs before the prune. None of that needs Postgres, and all of it
 * is worth pinning without one.
 */

function fakeReferrals(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    record: vi.fn(async () => {}),
    rollUpDay: vi.fn(async () => 1),
    pruneEventsBefore: vi.fn(async () => 0),
    daysWithEvents: vi.fn(async () => ["2026-09-01", "2026-09-02"]),
    dailyForProduct: vi.fn(async () => []),
    totalsByProduct: vi.fn(async () => new Map()),
    ...overrides,
  } as never;
}

function fakeProducts(row: { id: string; websiteUrl: string | null } | null) {
  return { findPublicBySlug: vi.fn(async () => row) };
}

describe("recordOutboundClick", () => {
  it("attributes the click to the product the slug resolves to", async () => {
    const referrals = fakeReferrals();
    const products = fakeProducts({
      id: "product-1",
      websiteUrl: "https://example.test",
    });

    const result = await recordOutboundClick({
      referrals,
      products,
      slug: "a-listing",
    });

    expect(products.findPublicBySlug).toHaveBeenCalledWith("a-listing");
    expect(result.productId).toBe("product-1");
    expect(
      (referrals as unknown as { record: ReturnType<typeof vi.fn> }).record
    ).toHaveBeenCalledWith("product-1", undefined);
  });

  it("refuses a slug that resolves to nothing", async () => {
    // The same answer a hidden, draft, or removed listing gets, because
    // findPublicBySlug applies the public-visibility predicate. A distinct
    // answer would make this route a way to probe for unpublished listings.
    const referrals = fakeReferrals();

    await expect(
      recordOutboundClick({
        referrals,
        products: fakeProducts(null),
        slug: "no-such-listing",
      })
    ).rejects.toBeInstanceOf(ReferralError);

    expect(
      (referrals as unknown as { record: ReturnType<typeof vi.fn> }).record
    ).not.toHaveBeenCalled();
  });

  it("still sends the visitor when the counter cannot be written", async () => {
    // A person clicking a link is not interested in our analytics. A failed
    // insert must not become an error page between them and where they were
    // going.
    const referrals = fakeReferrals({
      record: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });

    const result = await recordOutboundClick({
      referrals,
      products: fakeProducts({ id: "p", websiteUrl: "https://example.test" }),
      slug: "a-listing",
    });

    expect(result.websiteUrl).toBe("https://example.test");
  });

  it("returns a null destination rather than inventing one", async () => {
    const result = await recordOutboundClick({
      referrals: fakeReferrals(),
      products: fakeProducts({ id: "p", websiteUrl: null }),
      slug: "a-listing",
    });

    expect(result.websiteUrl).toBeNull();
  });
});

describe("runReferralMaintenance", () => {
  it("rolls every day up before it prunes anything", async () => {
    // The ordering is the safety property. Pruning first deletes the only copy
    // of numbers that were never summed, and nothing about the result looks
    // wrong afterwards.
    const order: string[] = [];
    const referrals = fakeReferrals({
      rollUpDay: vi.fn(async () => {
        order.push("rollup");
        return 1;
      }),
      pruneEventsBefore: vi.fn(async () => {
        order.push("prune");
        return 5;
      }),
    });

    const result = await runReferralMaintenance({ referrals });

    expect(order).toEqual(["rollup", "rollup", "prune"]);
    expect(result.days).toEqual(["2026-09-01", "2026-09-02"]);
    expect(result.pruned).toBe(5);
  });

  it("rolls up every day that still has raw rows, not only yesterday", async () => {
    // So a missed run repairs itself. A job that only ever touches yesterday
    // leaves a permanent hole wherever it failed to fire.
    const referrals = fakeReferrals({
      daysWithEvents: vi.fn(async () => [
        "2026-08-30",
        "2026-08-31",
        "2026-09-01",
      ]),
    });

    const result = await runReferralMaintenance({ referrals });

    expect(result.days).toHaveLength(3);
    expect(
      (referrals as unknown as { rollUpDay: ReturnType<typeof vi.fn> }).rollUpDay
    ).toHaveBeenCalledTimes(3);
  });
});
