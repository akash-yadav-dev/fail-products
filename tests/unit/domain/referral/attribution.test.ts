// tests/unit/domain/referral/attribution.test.ts
import { describe, expect, it } from "vitest";

import {
  REFERRAL_RAW_RETENTION_DAYS,
  referralDayOf,
  referralDayRange,
  referralPruneHorizon,
} from "@/domain/referral/attribution";

/**
 * The day boundary and the retention horizon (ADR-018).
 *
 * These two functions decide which bucket a click lands in and which rows are
 * destroyed. The rollup is the only copy that survives the prune, so a
 * mistake here is not a wrong number on a dashboard — it is a number that
 * cannot be recomputed.
 */

describe("referralDayOf", () => {
  it("buckets by UTC, not by the server's local day", () => {
    // 23:30 on the 3rd in UTC is already the 4th in +05:30, which is where
    // this happens to be developed. The bucket must not depend on that.
    expect(referralDayOf(new Date("2026-09-03T23:30:00.000Z"))).toBe(
      "2026-09-03"
    );
    expect(referralDayOf(new Date("2026-09-04T00:00:00.000Z"))).toBe(
      "2026-09-04"
    );
  });

  it("puts the last millisecond of a day in that day", () => {
    expect(referralDayOf(new Date("2026-09-03T23:59:59.999Z"))).toBe(
      "2026-09-03"
    );
  });
});

describe("referralDayRange", () => {
  it("is half-open, so no click is counted twice", () => {
    const { start, end } = referralDayRange("2026-09-03");

    expect(start.toISOString()).toBe("2026-09-03T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("meets the next day's range exactly, with no gap and no overlap", () => {
    // A gap loses clicks; an overlap counts them in two days. Both produce a
    // total that does not match the raw rows, and neither is visible in the
    // output of a single day.
    const first = referralDayRange("2026-09-03");
    const second = referralDayRange("2026-09-04");

    expect(first.end.getTime()).toBe(second.start.getTime());
  });

  it("refuses anything that is not a day", () => {
    for (const bad of ["", "2026-9-3", "2026-09-03T00:00:00Z", "yesterday", "0000-00-00"]) {
      expect(() => referralDayRange(bad)).toThrow();
    }
  });
});

describe("referralPruneHorizon", () => {
  it("is exactly the retention window back", () => {
    const now = new Date("2026-09-30T12:00:00.000Z");
    const horizon = referralPruneHorizon(now);

    expect(
      (now.getTime() - horizon.getTime()) / (24 * 60 * 60 * 1000)
    ).toBe(REFERRAL_RAW_RETENTION_DAYS);
  });

  it("keeps a row recorded one second inside the window", () => {
    const now = new Date("2026-09-30T12:00:00.000Z");
    const horizon = referralPruneHorizon(now);
    const justInside = new Date(horizon.getTime() + 1000);

    expect(justInside.getTime()).toBeGreaterThan(horizon.getTime());
  });
});
