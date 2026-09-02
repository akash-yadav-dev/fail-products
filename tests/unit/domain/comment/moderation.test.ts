// tests/unit/domain/comment/moderation.test.ts
import { describe, expect, it } from "vitest";

import {
  COMMENT_MODERATION_STATES,
  PUBLIC_COMMENT_STATES,
  canTransitionComment,
  isCommentModerationState,
  isPublicCommentState,
} from "@/domain/comment/moderation";

describe("comment moderation states", () => {
  it("is the set docs/MODERATION.md §6 defines", () => {
    expect(COMMENT_MODERATION_STATES.map((state) => state.value)).toEqual([
      "VISIBLE",
      "PENDING",
      "HIDDEN",
      "REMOVED",
    ]);
  });

  it("has no FLAGGED, unlike the product axis", () => {
    // A flag on a product is a public signal the page renders. A comment under
    // suspicion is either shown or it is not; there is no third rendering.
    expect(isCommentModerationState("FLAGGED")).toBe(false);
  });

  it("rejects a value from a request that is not a state", () => {
    expect(isCommentModerationState("VISIBLE; DROP TABLE comments")).toBe(false);
    expect(isCommentModerationState(undefined)).toBe(false);
    expect(isCommentModerationState(["VISIBLE"])).toBe(false);
  });
});

describe("public visibility", () => {
  it("shows exactly one state", () => {
    expect(PUBLIC_COMMENT_STATES).toEqual(["VISIBLE"]);
  });

  it.each(["PENDING", "HIDDEN", "REMOVED"])("never shows %s", (state) => {
    expect(isPublicCommentState(state)).toBe(false);
  });

  it("is an allowlist, so a state added later defaults to invisible", () => {
    // The property the test exists for. Under `NOT IN (HIDDEN, REMOVED)` a
    // fifth state would be public the moment it was added, and nobody would
    // have decided that.
    expect(isPublicCommentState("SOME_STATE_ADDED_LATER")).toBe(false);
  });
});

describe("canTransitionComment", () => {
  it("rejects a no-op", () => {
    expect(canTransitionComment("HIDDEN", "HIDDEN")).toEqual({
      ok: false,
      reason: "SAME_STATE",
    });
  });

  it("allows a takedown to be undone", () => {
    // A moderation system that cannot say "we were wrong" forces the
    // correction to happen by direct database edit: unlogged and unattributed.
    expect(canTransitionComment("REMOVED", "VISIBLE")).toEqual({ ok: true });
  });

  it.each([
    ["VISIBLE", "HIDDEN"],
    ["VISIBLE", "REMOVED"],
    ["PENDING", "VISIBLE"],
    ["HIDDEN", "REMOVED"],
    ["REMOVED", "HIDDEN"],
  ] as const)("allows %s to %s", (from, to) => {
    expect(canTransitionComment(from, to)).toEqual({ ok: true });
  });
});
