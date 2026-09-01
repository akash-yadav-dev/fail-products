// tests/unit/domain/product/failure-status.test.ts
import { describe, expect, it } from "vitest";

import {
  FAILURE_STATUSES,
  findFailureStatus,
  findFailureStatusBySlug,
} from "@/domain/product/failure-status";

/**
 * `failure_status` is one of the three orthogonal product fields (ADR-013).
 * These functions decide what /status/[slug] resolves to, so an unknown slug
 * has to stay distinguishable from a known one — that is what produces the 404.
 */

describe("findFailureStatusBySlug", () => {
  it.each(FAILURE_STATUSES)(
    "resolves the definition for $slug",
    (status) => {
      expect(findFailureStatusBySlug(status.slug)).toEqual(status);
    }
  );

  it("returns undefined for a slug that is not a failure status", () => {
    expect(findFailureStatusBySlug("thriving")).toBeUndefined();
  });

  it("returns undefined for the empty string", () => {
    expect(findFailureStatusBySlug("")).toBeUndefined();
  });

  it("does not match on the stored value, only on the slug", () => {
    // /status/SHUT_DOWN must 404; only /status/shut-down resolves.
    expect(findFailureStatusBySlug("SHUT_DOWN")).toBeUndefined();
  });

  it("is case sensitive", () => {
    expect(findFailureStatusBySlug("Shut-Down")).toBeUndefined();
  });
});

describe("findFailureStatus", () => {
  it.each(FAILURE_STATUSES)("resolves the definition for $value", (status) => {
    expect(findFailureStatus(status.value)).toEqual(status);
  });

  it("throws on a value that is not a failure status", () => {
    // A row holding an unknown status is corrupt data, not a missing page.
    expect(() =>
      findFailureStatus("THRIVING" as never)
    ).toThrowError(/Unknown failure status: THRIVING/);
  });
});

describe("the status list itself", () => {
  it("carries the five statuses ADR-013 defines", () => {
    expect(FAILURE_STATUSES.map((status) => status.value)).toEqual([
      "STRUGGLING",
      "LOW_TRACTION",
      "ABANDONED",
      "SHUT_DOWN",
      "RECOVERING",
    ]);
  });

  it("has a unique slug per status", () => {
    const slugs = FAILURE_STATUSES.map((status) => status.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses URL-safe lowercase slugs", () => {
    for (const status of FAILURE_STATUSES) {
      expect(status.slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});
