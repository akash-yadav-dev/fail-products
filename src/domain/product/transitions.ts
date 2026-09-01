// src/domain/product/transitions.ts
import type { FailureStatus } from "@/domain/product/failure-status";

/**
 * The three state machines (ADR-013).
 *
 * The axes are orthogonal and stay that way. A product can be published *and*
 * flagged, hidden *while* recovering, or archived by its owner having never
 * been moderated. Collapsing them produces impossible states and forces a
 * moderator action to destroy the product's factual status.
 *
 * The load-bearing part of this file is the set of transitions it **rejects**.
 * The legal set is mostly obvious; the illegal set is the product rule, and it
 * is the half that a test suite has to name one by one.
 *
 * Domain code imports nothing from Next.js, React, or any provider.
 */

export const PUBLICATION_STATES = [
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "ARCHIVED",
] as const;

export const MODERATION_STATES = ["NONE", "FLAGGED", "HIDDEN", "REMOVED"] as const;

export type PublicationState = (typeof PUBLICATION_STATES)[number];
export type ModerationState = (typeof MODERATION_STATES)[number];

/** Who is permitted to move an axis. The axes have different actors by design. */
export type Actor = "OWNER" | "MODERATOR";

/** The axis a history row belongs to, so a timeline can be read per-axis. */
export type StatusAxis = "PUBLICATION" | "MODERATION" | "FAILURE";

export type TransitionRejection =
  | "SAME_STATE"
  | "ILLEGAL_TRANSITION"
  | "WRONG_ACTOR";

export type TransitionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: TransitionRejection };

const OK: TransitionResult = { ok: true };

/**
 * Publication is owner-controlled.
 *
 * Everything is reachable from everything except itself, with one exception:
 * PENDING_REVIEW is a queue position, not a destination an owner returns to
 * from PUBLISHED or ARCHIVED. Re-queuing an already-published product would
 * put a live listing back in a review queue that has no way to express "this
 * is already public", which is how a published product silently disappears.
 */
const PUBLICATION_TRANSITIONS: Readonly<
  Record<PublicationState, readonly PublicationState[]>
> = {
  DRAFT: ["PENDING_REVIEW", "PUBLISHED", "ARCHIVED"],
  PENDING_REVIEW: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT", "ARCHIVED"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

/**
 * Moderation is moderator-controlled, and fully reversible.
 *
 * REMOVED is deliberately **not** terminal. A takedown applied in error has to
 * be undoable, and a state machine that cannot express "we were wrong" forces
 * the correction to happen by direct database edit — unlogged, unattributed,
 * and invisible to the history table this exists to keep honest.
 */
const MODERATION_TRANSITIONS: Readonly<
  Record<ModerationState, readonly ModerationState[]>
> = {
  NONE: ["FLAGGED", "HIDDEN", "REMOVED"],
  FLAGGED: ["NONE", "HIDDEN", "REMOVED"],
  HIDDEN: ["NONE", "FLAGGED", "REMOVED"],
  REMOVED: ["NONE", "FLAGGED", "HIDDEN"],
};

/**
 * Can the owner move publication from `from` to `to`?
 *
 * A moderator cannot: publication is the owner's decision about their own
 * product, and a moderator who wants it off the public surface has HIDDEN and
 * REMOVED on their own axis. Letting moderation reach into this column is
 * exactly the collapse ADR-013 rejects.
 */
export function canTransitionPublication(
  from: PublicationState,
  to: PublicationState,
  actor: Actor
): TransitionResult {
  if (actor !== "OWNER") return { ok: false, reason: "WRONG_ACTOR" };
  if (from === to) return { ok: false, reason: "SAME_STATE" };
  if (!PUBLICATION_TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: "ILLEGAL_TRANSITION" };
  }
  return OK;
}

/** Can a moderator move moderation from `from` to `to`? An owner never can. */
export function canTransitionModeration(
  from: ModerationState,
  to: ModerationState,
  actor: Actor
): TransitionResult {
  if (actor !== "MODERATOR") return { ok: false, reason: "WRONG_ACTOR" };
  if (from === to) return { ok: false, reason: "SAME_STATE" };
  if (!MODERATION_TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: "ILLEGAL_TRANSITION" };
  }
  return OK;
}

/**
 * Can the owner change the failure status?
 *
 * Every pair is legal except a no-op. This is a deliberate decision, not a
 * missing rule: `failure_status` is the owner's factual claim about their own
 * product, and the honest corrections are exactly the ones a transition graph
 * would forbid. A founder who marked a product SHUT_DOWN prematurely, or
 * flagged RECOVERING too optimistically, must be able to say so — and a
 * product genuinely can go from RECOVERING back to STRUGGLING.
 *
 * The rule that matters here is the actor, not the graph: a moderator changing
 * what a product factually *is* would be the site putting words in a founder's
 * mouth.
 */
export function canTransitionFailureStatus(
  from: FailureStatus,
  to: FailureStatus,
  actor: Actor
): TransitionResult {
  if (actor !== "OWNER") return { ok: false, reason: "WRONG_ACTOR" };
  if (from === to) return { ok: false, reason: "SAME_STATE" };
  return OK;
}

/** The states an actor could legally move to. Drives the UI's options. */
export function allowedPublicationTargets(
  from: PublicationState,
  actor: Actor
): readonly PublicationState[] {
  return actor === "OWNER" ? PUBLICATION_TRANSITIONS[from] : [];
}

export function allowedModerationTargets(
  from: ModerationState,
  actor: Actor
): readonly ModerationState[] {
  return actor === "MODERATOR" ? MODERATION_TRANSITIONS[from] : [];
}
