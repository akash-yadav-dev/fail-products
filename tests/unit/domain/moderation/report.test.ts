// tests/unit/domain/moderation/report.test.ts
import { describe, expect, it } from "vitest";

import {
  MAX_REPORT_DETAIL_LENGTH,
  REPORT_REASONS,
  isReportReason,
  isReportStatus,
  isReportTargetType,
  parseReportDetail,
} from "@/domain/moderation/report";

describe("report reasons", () => {
  it("is the list docs/MODERATION.md §5 names", () => {
    // The guidelines page promises these words to a reporter. A queue that
    // categorises by a different set is a queue that answers a different
    // question from the one that was asked.
    expect(REPORT_REASONS.map((reason) => reason.label)).toEqual([
      "Spam",
      "Harassment",
      "Impersonation",
      "Privacy issue",
      "Scam or malware",
      "Copyright or trademark",
      "Incorrect information",
      "Something else",
    ]);
  });

  it("accepts every listed reason", () => {
    for (const reason of REPORT_REASONS) {
      expect(isReportReason(reason.value)).toBe(true);
    }
  });

  it("rejects a reason nobody defined", () => {
    expect(isReportReason("BECAUSE_I_SAID_SO")).toBe(false);
  });

  it("rejects a reason that is not a string", () => {
    // The value arrives from a `<select>`, and a `<select>` is a suggestion.
    // `formData.get` returns null for a field that was never sent.
    expect(isReportReason(null)).toBe(false);
    expect(isReportReason(undefined)).toBe(false);
    expect(isReportReason(["SPAM"])).toBe(false);
    expect(isReportReason({ value: "SPAM" })).toBe(false);
  });

  it("rejects a reason with SQL in it rather than trying to clean it", () => {
    expect(isReportReason("SPAM'; DROP TABLE reports; --")).toBe(false);
  });

  it("is case sensitive, because the database enum is", () => {
    expect(isReportReason("spam")).toBe(false);
  });
});

describe("report targets and statuses", () => {
  it("accepts the two target types and nothing else", () => {
    expect(isReportTargetType("PRODUCT")).toBe(true);
    expect(isReportTargetType("COMMENT")).toBe(true);
    expect(isReportTargetType("USER")).toBe(false);
    expect(isReportTargetType("")).toBe(false);
  });

  it("accepts the three statuses and nothing else", () => {
    expect(isReportStatus("OPEN")).toBe(true);
    expect(isReportStatus("ACTIONED")).toBe(true);
    expect(isReportStatus("DISMISSED")).toBe(true);
    expect(isReportStatus("REVIEWING")).toBe(false);
  });
});

describe("parseReportDetail", () => {
  it("keeps the reporter's own words", () => {
    expect(parseReportDetail("  They posted my home address.  ", "PRIVACY")).toEqual({
      ok: true,
      detail: "They posted my home address.",
    });
  });

  it("is optional for a reason that already says what is wrong", () => {
    expect(parseReportDetail("", "SPAM")).toEqual({ ok: true, detail: null });
    expect(parseReportDetail(null, "SPAM")).toEqual({ ok: true, detail: null });
  });

  it("is required when the reason is OTHER", () => {
    // "Something else" with no sentence gives a moderator nothing to act on.
    expect(parseReportDetail("", "OTHER")).toEqual({
      ok: false,
      reason: "DETAIL_REQUIRED",
    });
  });

  it("does not accept whitespace as an explanation", () => {
    expect(parseReportDetail("   \n\t ", "OTHER")).toEqual({
      ok: false,
      reason: "DETAIL_REQUIRED",
    });
  });

  it("truncates past the column's length rather than failing the report", () => {
    // The opposite choice from a comment body, and deliberately so. Losing the
    // tail of an over-long comment loses somebody's argument; losing the tail
    // of an over-long report still leaves a moderator a usable queue entry,
    // and refusing the report loses the whole complaint.
    const result = parseReportDetail("a".repeat(5000), "SPAM");

    expect(result).toEqual({
      ok: true,
      detail: "a".repeat(MAX_REPORT_DETAIL_LENGTH),
    });
  });

  it("normalises Windows line endings", () => {
    expect(parseReportDetail("one\r\ntwo", "SPAM")).toEqual({
      ok: true,
      detail: "one\ntwo",
    });
  });
});
