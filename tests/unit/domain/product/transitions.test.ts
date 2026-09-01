// tests/unit/domain/product/transitions.test.ts
import { describe, expect, it } from "vitest";

import { FAILURE_STATUSES } from "@/domain/product/failure-status";
import {
  MODERATION_STATES,
  PUBLICATION_STATES,
  allowedModerationTargets,
  allowedPublicationTargets,
  canTransitionFailureStatus,
  canTransitionModeration,
  canTransitionPublication,
  type ModerationState,
  type PublicationState,
} from "@/domain/product/transitions";

/**
 * ADR-013 keeps the three axes separate so a moderator action can never
 * overwrite what a product factually is.
 *
 * The legal transitions are the easy half. The illegal ones are the product
 * rule, so each is named and asserted rejected rather than covered in bulk.
 */

const LEGAL_PUBLICATION: ReadonlyArray<[PublicationState, PublicationState]> = [
  ["DRAFT", "PENDING_REVIEW"],
  ["DRAFT", "PUBLISHED"],
  ["DRAFT", "ARCHIVED"],
  ["PENDING_REVIEW", "DRAFT"],
  ["PENDING_REVIEW", "PUBLISHED"],
  ["PENDING_REVIEW", "ARCHIVED"],
  ["PUBLISHED", "DRAFT"],
  ["PUBLISHED", "ARCHIVED"],
  ["ARCHIVED", "DRAFT"],
  ["ARCHIVED", "PUBLISHED"],
];

describe("publication transitions", () => {
  it.each(LEGAL_PUBLICATION)("allows the owner to move %s -> %s", (from, to) => {
    expect(canTransitionPublication(from, to, "OWNER")).toEqual({ ok: true });
  });

  it.each([
    ["PUBLISHED", "PENDING_REVIEW"],
    ["ARCHIVED", "PENDING_REVIEW"],
  ] as ReadonlyArray<[PublicationState, PublicationState]>)(
    "rejects %s -> %s: a live listing must not re-enter the review queue",
    (from, to) => {
      expect(canTransitionPublication(from, to, "OWNER")).toEqual({
        ok: false,
        reason: "ILLEGAL_TRANSITION",
      });
    }
  );

  it.each(PUBLICATION_STATES)("rejects %s -> itself as a no-op", (state) => {
    expect(canTransitionPublication(state, state, "OWNER")).toEqual({
      ok: false,
      reason: "SAME_STATE",
    });
  });

  it.each(LEGAL_PUBLICATION)(
    "refuses a moderator on %s -> %s, on every otherwise-legal move",
    (from, to) => {
      // A moderator reaching into publication is the axis collapse ADR-013
      // exists to prevent. They have HIDDEN and REMOVED on their own axis.
      expect(canTransitionPublication(from, to, "MODERATOR")).toEqual({
        ok: false,
        reason: "WRONG_ACTOR",
      });
    }
  );

  it("checks the actor before the transition", () => {
    // A moderator attempting an illegal move is refused as the wrong actor, so
    // the error never reveals which transitions exist.
    expect(canTransitionPublication("PUBLISHED", "PENDING_REVIEW", "MODERATOR"))
      .toEqual({ ok: false, reason: "WRONG_ACTOR" });
  });

  it("enumerates exactly the legal targets for the UI", () => {
    expect(allowedPublicationTargets("PUBLISHED", "OWNER")).toEqual([
      "DRAFT",
      "ARCHIVED",
    ]);
  });

  it("offers a moderator no publication targets at all", () => {
    for (const state of PUBLICATION_STATES) {
      expect(allowedPublicationTargets(state, "MODERATOR")).toEqual([]);
    }
  });
});

describe("moderation transitions", () => {
  const pairs = MODERATION_STATES.flatMap((from) =>
    MODERATION_STATES.filter((to) => to !== from).map(
      (to) => [from, to] as [ModerationState, ModerationState]
    )
  );

  it.each(pairs)("allows a moderator to move %s -> %s", (from, to) => {
    expect(canTransitionModeration(from, to, "MODERATOR")).toEqual({ ok: true });
  });

  it("lets a moderator reverse a removal", () => {
    // REMOVED is not terminal on purpose: a takedown applied in error has to be
    // undoable, or the correction happens by unlogged database edit.
    expect(canTransitionModeration("REMOVED", "NONE", "MODERATOR")).toEqual({
      ok: true,
    });
  });

  it.each(MODERATION_STATES)("rejects %s -> itself as a no-op", (state) => {
    expect(canTransitionModeration(state, state, "MODERATOR")).toEqual({
      ok: false,
      reason: "SAME_STATE",
    });
  });

  it.each(pairs)("refuses an owner on %s -> %s", (from, to) => {
    // An owner moderating their own listing would make moderation meaningless.
    expect(canTransitionModeration(from, to, "OWNER")).toEqual({
      ok: false,
      reason: "WRONG_ACTOR",
    });
  });

  it("offers an owner no moderation targets at all", () => {
    for (const state of MODERATION_STATES) {
      expect(allowedModerationTargets(state, "OWNER")).toEqual([]);
    }
  });
});

describe("failure status transitions", () => {
  const values = FAILURE_STATUSES.map((status) => status.value);

  it("allows the owner every change except a no-op", () => {
    // Deliberately unconstrained: this is the owner's factual claim about their
    // own product, and the honest corrections are the ones a graph would block.
    for (const from of values) {
      for (const to of values) {
        expect(canTransitionFailureStatus(from, to, "OWNER")).toEqual(
          from === to ? { ok: false, reason: "SAME_STATE" } : { ok: true }
        );
      }
    }
  });

  it("allows a recovering product to relapse", () => {
    expect(canTransitionFailureStatus("RECOVERING", "STRUGGLING", "OWNER")).toEqual({
      ok: true,
    });
  });

  it("refuses a moderator on every pair", () => {
    // A moderator changing what a product factually is would be the site
    // putting words in a founder's mouth.
    for (const from of values) {
      for (const to of values) {
        expect(canTransitionFailureStatus(from, to, "MODERATOR")).toEqual({
          ok: false,
          reason: "WRONG_ACTOR",
        });
      }
    }
  });
});

describe("axis independence", () => {
  it("decides publication without consulting moderation", () => {
    // The signatures make the ADR-013 guarantee structural: neither function
    // can see the other axis, so neither can overwrite it.
    expect(canTransitionPublication.length).toBe(3);
    expect(canTransitionModeration.length).toBe(3);
  });
});
