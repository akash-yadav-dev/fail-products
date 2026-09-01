// src/db/schema/enums.ts
import { pgEnum } from "drizzle-orm/pg-core";

import { FAILURE_STATUSES } from "@/domain/product/failure-status";

/**
 * ADR-013 — three orthogonal axes, never collapsed into one enum. A product can
 * be published and flagged, hidden while recovering, or archived by its owner
 * having never been moderated.
 */

/** Where the owner is in the publishing flow. Owner-controlled. */
export const publicationStateEnum = pgEnum("publication_state", [
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "ARCHIVED",
]);

/** What moderation has done to it. Moderator-controlled. */
export const moderationStateEnum = pgEnum("moderation_state", [
  "NONE",
  "FLAGGED",
  "HIDDEN",
  "REMOVED",
]);

/**
 * What the product is doing. Owner-controlled.
 *
 * Derived from the domain module rather than restated, so the enum and the UI
 * cannot disagree about the set of statuses. `pgEnum` needs a non-empty tuple,
 * which the cast supplies — `FAILURE_STATUSES` is a non-empty `as const` array.
 */
export const failureStatusEnum = pgEnum(
  "failure_status",
  FAILURE_STATUSES.map((status) => status.value) as unknown as [
    string,
    ...string[],
  ]
);

/**
 * Which of the three axes a history row records.
 *
 * ADR-013 requires `product_status_history` to cover all three. They are one
 * table rather than three because the timeline a moderator or an owner reads is
 * chronological across every axis — "published, then flagged, then marked
 * recovering" is one story, and three tables would make it a three-way merge.
 */
export const statusAxisEnum = pgEnum("status_axis", [
  "PUBLICATION",
  "MODERATION",
  "FAILURE",
]);

/**
 * The capacity the actor was acting in, recorded rather than inferred.
 *
 * A user's role can change after the fact. Storing what they were when they
 * acted keeps the audit trail true; deriving it at read time rewrites history
 * every time someone is promoted or demoted.
 */
export const actorRoleEnum = pgEnum("actor_role", ["OWNER", "MODERATOR", "SYSTEM"]);
