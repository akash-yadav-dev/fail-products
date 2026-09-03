// src/db/schema/moderation.ts
import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, updatedAt } from "@/db/schema/columns";
import { commentModerationStateEnum, comments } from "@/db/schema/comments";
import { products } from "@/db/schema/products";
import { users } from "@/db/schema/users";
import { REPORT_REASONS } from "@/domain/moderation/report";

/**
 * Report reasons, derived from the domain module rather than restated.
 *
 * The same pattern as `failure_status`: the enum and the form cannot disagree
 * about the set of reasons, because there is one list and the database reads
 * it. `pgEnum` needs a non-empty tuple, which the cast supplies.
 */
export const reportReasonEnum = pgEnum(
  "report_reason",
  REPORT_REASONS.map((reason) => reason.value) as unknown as [string, ...string[]]
);

export const reportTargetTypeEnum = pgEnum("report_target_type", [
  "PRODUCT",
  "COMMENT",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "OPEN",
  "ACTIONED",
  "DISMISSED",
]);

/**
 * An abuse report against a product or a comment.
 *
 * **One table, not two.** A report about a product and a report about a comment
 * are read by the same person, in the same queue, with the same statuses and
 * the same duplicate rule. Two tables would mean two queries, two dedupe
 * indexes, and a queue that has to merge and re-sort them — for a difference
 * that is one column wide.
 *
 * The polymorphism is held by the database rather than by convention: a CHECK
 * requires exactly one target, and the target type has to match the column that
 * is set. Without both halves, a row can say PRODUCT while pointing at a
 * comment, and every query that trusts the discriminator is then wrong.
 */
export const reports = pgTable(
  "reports",
  {
    id: primaryId(),

    targetType: reportTargetTypeEnum("target_type").notNull(),

    productId: uuid("product_id").references(() => products.id, {
      onDelete: "cascade",
    }),
    commentId: uuid("comment_id").references(() => comments.id, {
      onDelete: "cascade",
    }),

    /**
     * Null once the reporting account is deleted.
     *
     * docs/LEGAL.md §5: the reporter is anonymised and the report is retained
     * for twelve months, because a report's value to abuse-pattern detection
     * does not depend on who filed it.
     */
    reporterId: uuid("reporter_id").references(() => users.id, {
      onDelete: "set null",
    }),

    reason: reportReasonEnum("reason").notNull(),
    /** The reporter's own words. Required when the reason is OTHER. */
    detail: varchar("detail", { length: 1000 }),

    status: reportStatusEnum("status").notNull().default("OPEN"),

    /** Who closed it, and what they wrote. Null while the report is OPEN. */
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    resolutionNote: text("resolution_note"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // The queue: everything open, newest first.
    index("reports_status_created_idx").on(table.status, table.createdAt),
    index("reports_product_idx").on(table.productId),
    index("reports_comment_idx").on(table.commentId),

    /**
     * The duplicate rule (Phase 3 slice 3.3): one **open** report per account
     * per target. Two partial unique indexes rather than one over both columns,
     * because Postgres treats NULLs in a unique index as distinct by default —
     * a single index would let one account file unlimited reports on one
     * product, each row differing only in a NULL nobody set.
     *
     * The `status = OPEN` predicate is the whole point of the second version
     * of this index. Without it the rule was not "collapse duplicates" but
     * "one report per account per target, ever". A reporter whose first report
     * was dismissed could never report that target again — not months later,
     * not with a new reason, not about something new the product had done. The
     * insert hit `onConflictDoNothing`, the row was discarded, and they were
     * told "Thanks — a moderator will look at this." Nobody would.
     *
     * Scoped to OPEN, concurrent reports on one live complaint still collapse
     * into one queue entry, which is what the rule was for, and a closed
     * verdict stops being permanent.
     */
    uniqueIndex("reports_reporter_product_key")
      .on(table.reporterId, table.productId)
      .where(sql`${table.productId} IS NOT NULL AND ${table.status} = 'OPEN'`),
    uniqueIndex("reports_reporter_comment_key")
      .on(table.reporterId, table.commentId)
      .where(sql`${table.commentId} IS NOT NULL AND ${table.status} = 'OPEN'`),

    // Exactly one target, and the discriminator agrees with it.
    check(
      "reports_one_target",
      sql`(${table.targetType} = 'PRODUCT' AND ${table.productId} IS NOT NULL AND ${table.commentId} IS NULL)
       OR (${table.targetType} = 'COMMENT' AND ${table.commentId} IS NOT NULL AND ${table.productId} IS NULL)`
    ),
    // A resolved report names its resolver and when; an open one names neither.
    check(
      "reports_resolution_complete",
      sql`(${table.status} = 'OPEN' AND ${table.resolvedAt} IS NULL)
       OR (${table.status} <> 'OPEN' AND ${table.resolvedAt} IS NOT NULL)`
    ),
  ]
);

/**
 * Every moderation change a comment has undergone.
 *
 * The direct counterpart of `product_status_history`, and it exists for the
 * same reason ADR-013 gives: "why is this hidden?" has to have an answer that
 * does not depend on anyone's memory. `docs/MODERATION.md` §10 promises an
 * appeal path, and an appeal against an unrecorded decision cannot be heard.
 *
 * Products are **not** recorded here. Their moderation lands in
 * `product_status_history`, where it sits on one timeline with the owner's own
 * publication and status changes — which is the whole point of that table, and
 * duplicating half of it here would create two logs that can disagree.
 */
export const commentStatusHistory = pgTable(
  "comment_status_history",
  {
    id: primaryId(),

    commentId: uuid("comment_id")
      .notNull()
      // The history dies with the comment. It exists to explain something that
      // is on the site; keeping a moderation record for a row that no longer
      // exists retains personal data past its purpose (docs/LEGAL.md §5).
      .references(() => comments.id, { onDelete: "cascade" }),

    fromValue: commentModerationStateEnum("from_value").notNull(),
    toValue: commentModerationStateEnum("to_value").notNull(),

    /** Null once the acting account is deleted. The action still happened. */
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),

    /** The report this acted on, when there was one. Null for a spot check. */
    reportId: uuid("report_id").references(() => reports.id, {
      onDelete: "set null",
    }),

    /** Required by policy: a takedown with no reason cannot be reviewed. */
    reason: text("reason").notNull(),

    createdAt: createdAt(),
  },
  (table) => [
    index("comment_status_history_comment_idx").on(
      table.commentId,
      table.createdAt
    ),
    // The moderation audit: everything one moderator did.
    index("comment_status_history_actor_idx").on(table.actorId),
  ]
);

export type ReportRow = typeof reports.$inferSelect;
export type NewReportRow = typeof reports.$inferInsert;
export type CommentStatusHistoryRow = typeof commentStatusHistory.$inferSelect;
