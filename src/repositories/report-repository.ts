// src/repositories/report-repository.ts
import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { Database } from "@/db";
import {
  commentStatusHistory,
  comments,
  products,
  reports,
  users,
} from "@/db/schema";
import type { CommentModerationState } from "@/domain/comment/moderation";
import type {
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from "@/domain/moderation/report";

/**
 * Reports and the moderation audit trail.
 *
 * Reads here are deliberately **not** filtered by public visibility: a report
 * about a listing that has already been hidden is exactly the kind a moderator
 * still has to reach, and a queue that silently drops those is a queue that
 * loses the appeals. Everything this class returns is behind the moderator
 * check in the service.
 */

export class ReportRepository {
  constructor(private readonly db: Database) {}

  /**
   * Files a report, collapsing a duplicate rather than rejecting it.
   *
   * `onConflictDoNothing` against the two partial unique indexes: one account
   * reporting the same target twice is somebody who did not see their own
   * first report, not an attack. Telling them "you already reported this" is
   * worse than accepting it silently — it confirms nothing useful and invites
   * a second attempt through another account.
   *
   * The return says which happened, so the service can answer honestly
   * without leaking whether a moderator has acted since.
   */
  async file(input: {
    targetType: ReportTargetType;
    productId: string | null;
    commentId: string | null;
    reporterId: string;
    reason: ReportReason;
    detail: string | null;
  }): Promise<{ id: string; created: boolean }> {
    const [row] = await this.db
      .insert(reports)
      .values(input)
      .onConflictDoNothing()
      .returning({ id: reports.id });

    if (row) return { id: row.id, created: true };

    // The conflict path: the existing row is the report that already stands.
    const [existing] = await this.db
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.reporterId, input.reporterId),
          input.productId
            ? eq(reports.productId, input.productId)
            : eq(reports.commentId, input.commentId!)
        )
      )
      .limit(1);

    return { id: existing?.id ?? "", created: false };
  }

  /** A product a report may be filed against, or null. */
  async findReportableProduct(productId: string) {
    const [row] = await this.db
      .select({ id: products.id, slug: products.slug })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    return row ?? null;
  }

  /** A comment a report may be filed against, or null. */
  async findReportableComment(commentId: string) {
    const [row] = await this.db
      .select({ id: comments.id, productSlug: products.slug })
      .from(comments)
      .innerJoin(products, eq(comments.productId, products.id))
      .where(eq(comments.id, commentId))
      .limit(1);

    return row ?? null;
  }

  /**
   * The moderation queue, newest first.
   *
   * One query with both target shapes joined in, rather than a query per type
   * and a merge in JavaScript — the queue is sorted by age across both, and
   * re-sorting two pages in memory gives the wrong answer at any boundary.
   */
  async listByStatus(status: ReportStatus, limit: number) {
    return this.db
      .select({
        id: reports.id,
        targetType: reports.targetType,
        reason: reports.reason,
        detail: reports.detail,
        status: reports.status,
        createdAt: reports.createdAt,
        reporterUsername: users.username,
        productId: reports.productId,
        commentId: reports.commentId,
        productSlug: products.slug,
        productName: products.name,
        productModerationState: products.moderationState,
        commentBody: comments.body,
        commentModerationState: comments.moderationState,
      })
      .from(reports)
      .leftJoin(users, eq(reports.reporterId, users.id))
      .leftJoin(comments, eq(reports.commentId, comments.id))
      // The product is reached either directly or through the comment, so one
      // join covers both target types.
      .leftJoin(
        products,
        sql`${products.id} = coalesce(${reports.productId}, ${comments.productId})`
      )
      .where(eq(reports.status, status))
      // Oldest first, which is how a queue is worked rather than how a feed is
      // read. Newest-first with a hard limit starves: once there are more open
      // reports than the page holds, every new arrival pushes the oldest
      // further out of reach and they can never be worked at all — and the
      // oldest are the ones that have been waiting longest. Oldest-first makes
      // the same bound self-draining. `reports_status_created_idx` covers
      // either direction, so this costs nothing.
      .orderBy(asc(reports.createdAt))
      .limit(limit);
  }

  async findById(id: string) {
    const [row] = await this.db
      .select({
        id: reports.id,
        targetType: reports.targetType,
        productId: reports.productId,
        commentId: reports.commentId,
        status: reports.status,
      })
      .from(reports)
      .where(eq(reports.id, id))
      .limit(1);

    return row ?? null;
  }

  /**
   * Closes a report.
   *
   * The `status = OPEN` predicate is the concurrency control: two moderators
   * closing the same report at once produce one write and one no-op, rather
   * than a second resolution overwriting the first one's note and timestamp.
   */
  async resolve(input: {
    id: string;
    status: Exclude<ReportStatus, "OPEN">;
    resolvedBy: string;
    note: string | null;
    now: Date;
  }): Promise<boolean> {
    const rows = await this.db
      .update(reports)
      .set({
        status: input.status,
        resolvedBy: input.resolvedBy,
        resolvedAt: input.now,
        resolutionNote: input.note,
        updatedAt: input.now,
      })
      .where(and(eq(reports.id, input.id), eq(reports.status, "OPEN")))
      .returning({ id: reports.id });

    return rows.length === 1;
  }

  /** How many reports are waiting. Drives the badge on the queue. */
  async countOpen(): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(reports)
      .where(eq(reports.status, "OPEN"));

    return row?.total ?? 0;
  }

  /**
   * Closes every open report on one target at once.
   *
   * When a moderator hides a comment, the five reports about that comment are
   * all answered by the same act. Leaving them open means the queue keeps
   * showing work that is already done, which is how a queue stops being read.
   */
  async resolveOpenForTarget(input: {
    productId?: string;
    commentId?: string;
    status: Exclude<ReportStatus, "OPEN">;
    resolvedBy: string;
    note: string | null;
    now: Date;
  }): Promise<string[]> {
    const target = input.productId
      ? eq(reports.productId, input.productId)
      : eq(reports.commentId, input.commentId!);

    const rows = await this.db
      .update(reports)
      .set({
        status: input.status,
        resolvedBy: input.resolvedBy,
        resolvedAt: input.now,
        resolutionNote: input.note,
        updatedAt: input.now,
      })
      .where(and(target, eq(reports.status, "OPEN")))
      .returning({ id: reports.id });

    return rows.map((row) => row.id);
  }

  // -------------------------------------------------------------------------
  // Audit
  // -------------------------------------------------------------------------

  /** Records a comment moderation action. Never conditional. */
  async recordCommentAction(input: {
    commentId: string;
    fromValue: CommentModerationState;
    toValue: CommentModerationState;
    actorId: string;
    reportId: string | null;
    reason: string;
  }) {
    await this.db.insert(commentStatusHistory).values(input);
  }

  /** One comment's moderation history, newest first. */
  async listCommentHistory(commentId: string, limit = 50) {
    return this.db
      .select({
        id: commentStatusHistory.id,
        fromValue: commentStatusHistory.fromValue,
        toValue: commentStatusHistory.toValue,
        reason: commentStatusHistory.reason,
        createdAt: commentStatusHistory.createdAt,
        actorUsername: users.username,
      })
      .from(commentStatusHistory)
      .leftJoin(users, eq(commentStatusHistory.actorId, users.id))
      .where(eq(commentStatusHistory.commentId, commentId))
      .orderBy(desc(commentStatusHistory.createdAt))
      .limit(limit);
  }

  /**
   * Everything one moderator has done, newest first.
   *
   * `docs/MODERATION.md` §10 promises an appeal path, and an appeal is heard
   * against a record. This is that record for comments; products keep theirs in
   * `product_status_history`, on the timeline that also holds the owner's own
   * changes (ADR-013).
   *
   * Unindexed on purpose, for now. There is no WHERE clause and no index on
   * `created_at` alone — the two that exist are `(comment_id, created_at)` and
   * `(actor_id)` — so Postgres scans the table and top-N sorts. The output is
   * bounded; the scan is not, and the table grows by one row per moderation
   * action forever.
   *
   * The trigger, recorded so it is a decision rather than a discovery: add
   * `comment_status_history_created_idx` on `created_at` when the table passes
   * roughly a few thousand rows, or bound this query by date. Adding it today
   * would be an index with no access pattern behind it, which is the
   * mirror-image defect.
   */
  async listRecentActions(limit = 50) {
    return this.db
      .select({
        id: commentStatusHistory.id,
        commentId: commentStatusHistory.commentId,
        fromValue: commentStatusHistory.fromValue,
        toValue: commentStatusHistory.toValue,
        reason: commentStatusHistory.reason,
        createdAt: commentStatusHistory.createdAt,
        actorUsername: users.username,
        productSlug: products.slug,
      })
      .from(commentStatusHistory)
      .leftJoin(users, eq(commentStatusHistory.actorId, users.id))
      .leftJoin(comments, eq(commentStatusHistory.commentId, comments.id))
      .leftJoin(products, eq(comments.productId, products.id))
      .orderBy(desc(commentStatusHistory.createdAt))
      .limit(limit);
  }
}
