// src/domain/moderation/report.ts
/**
 * Abuse reports (`docs/MODERATION.md` §5).
 *
 * The reason list is the one the moderation policy names, in the policy's own
 * words, so a queue entry says the same thing the guidelines page promised the
 * reporter it would. A free-text-only report is unsortable and a report with an
 * invented taxonomy is worse: the moderator ends up guessing which of two
 * similar words the reporter meant.
 *
 * Domain code imports nothing from Next.js, React, Drizzle, or any provider.
 */

export const REPORT_REASONS = [
  {
    value: "SPAM",
    label: "Spam",
    description: "Advertising, repetition, or self-promotion dressed as feedback.",
  },
  {
    value: "HARASSMENT",
    label: "Harassment",
    description:
      "Targets a person rather than a product. Threats, abuse, or a pile-on.",
  },
  {
    value: "IMPERSONATION",
    label: "Impersonation",
    description: "Claims to be someone they are not, or a company they are not.",
  },
  {
    value: "PRIVACY",
    label: "Privacy issue",
    description:
      "Publishes an address, a phone number, a private email, or a credential.",
  },
  {
    value: "SCAM_OR_MALWARE",
    label: "Scam or malware",
    description: "Links to phishing, malware, or a deliberate fraud.",
  },
  {
    value: "COPYRIGHT",
    label: "Copyright or trademark",
    description: "Uses work or a name the poster has no right to use.",
  },
  {
    value: "INCORRECT_INFORMATION",
    label: "Incorrect information",
    description:
      "States something about a product as fact when it is not true.",
  },
  {
    value: "OTHER",
    label: "Something else",
    description: "Anything the list above does not cover. Say what, below.",
  },
] as const;

export type ReportReasonDefinition = (typeof REPORT_REASONS)[number];
export type ReportReason = ReportReasonDefinition["value"];

/** What a report is about. Exactly one target, never both. */
export const REPORT_TARGET_TYPES = ["PRODUCT", "COMMENT"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/**
 * Where a report is in the queue.
 *
 * Three states and no "reviewing". A queue with a claimed state needs someone
 * to unclaim it when a moderator walks away, and there is one moderator
 * (`AGENTS.md` §6). It can be added when there are two.
 */
export const REPORT_STATUSES = ["OPEN", "ACTIONED", "DISMISSED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Free-text the reporter adds. Bounded; the column matches. */
export const MAX_REPORT_DETAIL_LENGTH = 1000;

export function isReportReason(input: unknown): input is ReportReason {
  return (
    typeof input === "string" &&
    REPORT_REASONS.some((reason) => reason.value === input)
  );
}

export function isReportTargetType(input: unknown): input is ReportTargetType {
  return (
    typeof input === "string" &&
    (REPORT_TARGET_TYPES as readonly string[]).includes(input)
  );
}

export function isReportStatus(input: unknown): input is ReportStatus {
  return (
    typeof input === "string" &&
    (REPORT_STATUSES as readonly string[]).includes(input)
  );
}

export function findReportReason(value: ReportReason): ReportReasonDefinition {
  const reason = REPORT_REASONS.find((entry) => entry.value === value);
  if (!reason) throw new Error(`Unknown report reason: ${value}`);
  return reason;
}

/**
 * Normalises the reporter's own words.
 *
 * Optional for every reason but one: `OTHER` means the list did not fit, and a
 * report that says only "something else" gives a moderator nothing to act on.
 * Requiring the sentence there is the difference between a queue entry and a
 * shrug.
 */
export function parseReportDetail(
  input: unknown,
  reason: ReportReason
): { ok: true; detail: string | null } | { ok: false; reason: "DETAIL_REQUIRED" } {
  const detail =
    typeof input === "string"
      ? input.replace(/\r\n?/g, "\n").trim().slice(0, MAX_REPORT_DETAIL_LENGTH)
      : "";

  if (detail.length === 0) {
    return reason === "OTHER"
      ? { ok: false, reason: "DETAIL_REQUIRED" }
      : { ok: true, detail: null };
  }

  return { ok: true, detail };
}
