// src/domain/product/failure-status.ts
/**
 * `failure_status` — what the product is doing. Owner-controlled.
 *
 * One of the three orthogonal product fields defined in docs/PRODUCT.md #5.1
 * (ADR-013). It is never collapsed together with `publication_state` or
 * `moderation_state`.
 *
 * Domain code imports nothing from Next.js, React, or any provider.
 */

export const FAILURE_STATUSES = [
  {
    value: "STRUGGLING",
    slug: "struggling",
    label: "Struggling",
    description: "Live, but with little or no meaningful traction.",
  },
  {
    value: "LOW_TRACTION",
    slug: "low-traction",
    label: "Low traction",
    description: "Still running, but with weak usage or traffic.",
  },
  {
    value: "ABANDONED",
    slug: "abandoned",
    label: "Abandoned",
    description: "No longer actively maintained.",
  },
  {
    value: "SHUT_DOWN",
    slug: "shut-down",
    label: "Shut down",
    description: "The website or app is no longer available.",
  },
  {
    value: "RECOVERING",
    slug: "recovering",
    label: "Recovering",
    description:
      "Formerly listed as failed, now showing meaningful improvement.",
  },
] as const;

export type FailureStatusDefinition = (typeof FAILURE_STATUSES)[number];
export type FailureStatus = FailureStatusDefinition["value"];
export type FailureStatusSlug = FailureStatusDefinition["slug"];

export function findFailureStatusBySlug(
  slug: string
): FailureStatusDefinition | undefined {
  return FAILURE_STATUSES.find((status) => status.slug === slug);
}

export function findFailureStatus(
  value: FailureStatus
): FailureStatusDefinition {
  const status = FAILURE_STATUSES.find((entry) => entry.value === value);

  if (!status) {
    throw new Error(`Unknown failure status: ${value}`);
  }

  return status;
}
