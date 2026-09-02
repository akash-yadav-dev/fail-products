// src/domain/comment/moderation.ts
/**
 * The comment moderation axis (`docs/MODERATION.md` §6).
 *
 * Four states, and only one of them is public. The rule that matters is the
 * one below it: `PUBLIC_COMMENT_STATES` is the single definition of what a
 * visitor may see, so a new state cannot be added without a decision about
 * whether it leaks — which is exactly the mistake that a per-query `!== HIDDEN`
 * check invites.
 *
 * Domain code imports nothing from Next.js, React, Drizzle, or any provider.
 */

export const COMMENT_MODERATION_STATES = [
  {
    value: "VISIBLE",
    label: "Visible",
    description: "Shown to everyone. The default for a new comment.",
  },
  {
    value: "PENDING",
    label: "Pending review",
    description: "Held pending a moderator decision. Not public.",
  },
  {
    value: "HIDDEN",
    label: "Hidden",
    description: "Removed from the public page, retained for appeal.",
  },
  {
    value: "REMOVED",
    label: "Removed",
    description: "Taken down. Retained only as a moderation record.",
  },
] as const;

export type CommentModerationStateDefinition =
  (typeof COMMENT_MODERATION_STATES)[number];
export type CommentModerationState =
  CommentModerationStateDefinition["value"];

/**
 * The states a visitor may see. **One entry, and it stays that way by default.**
 *
 * Stated as the allowlist rather than as a list of exclusions. `NOT IN
 * (HIDDEN, REMOVED)` is the same thing today and stops being the same thing the
 * moment a fifth state is added — a new state defaults to visible under an
 * exclusion and defaults to hidden under an allowlist, and only one of those is
 * the safe direction to be wrong in.
 */
export const PUBLIC_COMMENT_STATES = ["VISIBLE"] as const;

export function isPublicCommentState(
  state: string
): state is (typeof PUBLIC_COMMENT_STATES)[number] {
  return (PUBLIC_COMMENT_STATES as readonly string[]).includes(state);
}

export function isCommentModerationState(
  input: unknown
): input is CommentModerationState {
  return (
    typeof input === "string" &&
    COMMENT_MODERATION_STATES.some((state) => state.value === input)
  );
}

export function findCommentModerationState(
  value: CommentModerationState
): CommentModerationStateDefinition {
  const state = COMMENT_MODERATION_STATES.find(
    (entry) => entry.value === value
  );
  if (!state) throw new Error(`Unknown comment moderation state: ${value}`);
  return state;
}

/**
 * Whether a moderator may move a comment from one state to another.
 *
 * Every pair is legal except a no-op, and that is the same decision
 * `canTransitionFailureStatus` makes for products: the graph a moderation
 * system needs most is the one that lets it say "we were wrong". A state
 * machine that cannot reach VISIBLE from REMOVED forces the correction to
 * happen by direct database edit — unlogged, unattributed, and invisible to
 * the audit trail the whole system exists to keep.
 *
 * The rule that is enforced is the actor, and it is enforced in the service
 * against the session, never here against a value from a request.
 */
export function canTransitionComment(
  from: CommentModerationState,
  to: CommentModerationState
): { ok: true } | { ok: false; reason: "SAME_STATE" } {
  if (from === to) return { ok: false, reason: "SAME_STATE" };
  return { ok: true };
}
