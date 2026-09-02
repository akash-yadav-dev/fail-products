// src/services/moderation/moderation-service.ts
import {
  canTransitionComment,
  type CommentModerationState,
} from "@/domain/comment/moderation";
import {
  isReportReason,
  isReportStatus,
  parseReportDetail,
  type ReportReason,
  type ReportStatus,
  type ReportTargetType,
} from "@/domain/moderation/report";
import {
  canTransitionModeration,
  type ModerationState,
} from "@/domain/product/transitions";
import type { RateLimiter } from "@/lib/security/rate-limit";
import type { CommentRepository } from "@/repositories/comment-repository";
import type { ProductRepository } from "@/repositories/product-repository";
import type { ReportRepository } from "@/repositories/report-repository";
import { RATE_LIMITS } from "@/services/security/rate-limit";

/**
 * Reporting and moderation use cases.
 *
 * Two audiences in one module because they are two halves of one loop: a report
 * is only worth taking if something answers it, and an action is only
 * accountable if it names the report it answered.
 *
 * Every moderator entry point re-checks the role **from the database**, against
 * the session's account id. `docs/SECURITY.md` §3 is explicit that
 * authorization is never inferred from the UI, and a role carried in a session
 * or a cookie would leave a demoted moderator holding access until their
 * session expired.
 */

export type ModerationServiceError =
  | "NOT_SIGNED_IN"
  | "FORBIDDEN"
  | "TARGET_NOT_FOUND"
  | "REPORT_NOT_FOUND"
  | "INVALID_REASON"
  | "DETAIL_REQUIRED"
  | "REASON_REQUIRED"
  | "ILLEGAL_TRANSITION"
  | "ALREADY_RESOLVED"
  | "RATE_LIMITED";

export class ModerationError extends Error {
  constructor(
    readonly code: ModerationServiceError,
    readonly resetAt?: number
  ) {
    super(code);
    this.name = "ModerationError";
  }
}

export type ModerationViewer = {
  /** Null when signed out. Read from the session, never from a form. */
  readonly userId: string | null;
};

/** How many rows the queue shows at once. Bounded, like every other list. */
export const MODERATION_QUEUE_SIZE = 50;

/** A moderator action must say why. An empty reason is not a reason. */
const MAX_REASON_LENGTH = 500;

function parseModerationReason(input: unknown): string {
  const reason = typeof input === "string" ? input.trim() : "";
  if (reason.length === 0) throw new ModerationError("REASON_REQUIRED");
  return reason.slice(0, MAX_REASON_LENGTH);
}

/**
 * Confirms the viewer holds the moderator role, or throws.
 *
 * Returns the account id so a caller cannot use the check without also using
 * the identity it verified — the shape that makes "authorised, then acted as
 * somebody else" impossible to write by accident.
 */
async function requireModerator(input: {
  users: { findRole(id: string): Promise<string | null> };
  viewer: ModerationViewer;
}): Promise<string> {
  if (!input.viewer.userId) throw new ModerationError("NOT_SIGNED_IN");

  const role = await input.users.findRole(input.viewer.userId);
  if (role !== "MODERATOR") throw new ModerationError("FORBIDDEN");

  return input.viewer.userId;
}

/**
 * Files a report against a product or a comment.
 *
 * Signed-in only. `docs/MODERATION.md` §5 puts a report action on every public
 * product and comment, and the duplicate rule in the Phase 3 plan — "duplicate
 * reports from one user on one target collapse" — needs an account to attribute
 * a report to before it can collapse anything.
 *
 * Reporting is itself an abuse vector: a coordinated group filing reports is
 * how a moderation queue gets used as a weapon. Hence the rate limit, and hence
 * a tighter one than commenting.
 */
export async function fileReport(input: {
  reports: ReportRepository;
  rateLimiter: RateLimiter;
  viewer: ModerationViewer;
  targetType: unknown;
  targetId: string;
  reason: unknown;
  detail: unknown;
}) {
  if (input.targetType !== "PRODUCT" && input.targetType !== "COMMENT") {
    throw new ModerationError("TARGET_NOT_FOUND");
  }
  const targetType: ReportTargetType = input.targetType;

  if (!isReportReason(input.reason)) {
    throw new ModerationError("INVALID_REASON");
  }
  const reason: ReportReason = input.reason;

  const detail = parseReportDetail(input.detail, reason);
  if (!detail.ok) throw new ModerationError("DETAIL_REQUIRED");

  if (!input.viewer.userId) throw new ModerationError("NOT_SIGNED_IN");
  const reporterId = input.viewer.userId;

  // The target is re-loaded server-side. An id in a form is an assertion.
  const productSlug =
    targetType === "PRODUCT"
      ? (await input.reports.findReportableProduct(input.targetId))?.slug
      : (await input.reports.findReportableComment(input.targetId))?.productSlug;

  if (!productSlug) throw new ModerationError("TARGET_NOT_FOUND");

  const decision = await input.rateLimiter.consume(
    RATE_LIMITS.reportSubmit,
    reporterId
  );
  if (!decision.allowed) {
    throw new ModerationError("RATE_LIMITED", decision.resetAt);
  }

  const filed = await input.reports.file({
    targetType,
    productId: targetType === "PRODUCT" ? input.targetId : null,
    commentId: targetType === "COMMENT" ? input.targetId : null,
    reporterId,
    reason,
    detail: detail.detail,
  });

  // `created` is deliberately not surfaced to the reporter. "You already
  // reported this" tells them nothing they can act on, and a second attempt
  // through another account is the predictable response to being told.
  return { id: filed.id, productSlug, created: filed.created };
}

/** The queue. Moderator-only, and bounded like every other list. */
export async function listReports(input: {
  reports: ReportRepository;
  users: { findRole(id: string): Promise<string | null> };
  viewer: ModerationViewer;
  status?: unknown;
}) {
  await requireModerator(input);

  const status: ReportStatus = isReportStatus(input.status)
    ? input.status
    : "OPEN";

  const [items, openCount] = await Promise.all([
    input.reports.listByStatus(status, MODERATION_QUEUE_SIZE),
    input.reports.countOpen(),
  ]);

  return { items, status, openCount };
}

/** The recent moderation log. Moderator-only. */
export async function listModerationLog(input: {
  reports: ReportRepository;
  users: { findRole(id: string): Promise<string | null> };
  viewer: ModerationViewer;
}) {
  await requireModerator(input);
  return input.reports.listRecentActions();
}

/**
 * Moderates a comment and closes the reports that asked for it.
 *
 * Three writes, in this order and never a different one: the state, the audit
 * row, then the reports. If the audit write fails the state change has already
 * happened and the row is discoverable from the comment itself; if the report
 * close fails the queue shows work that is already done. Both are recoverable.
 * The reverse order is not: a resolved report pointing at a comment that was
 * never touched is a moderation record that is simply false.
 */
export async function moderateComment(input: {
  reports: ReportRepository;
  comments: CommentRepository;
  users: { findRole(id: string): Promise<string | null> };
  viewer: ModerationViewer;
  commentId: string;
  to: CommentModerationState;
  reason: unknown;
  /** The queue entry this answers, when the action came from one. */
  reportId?: string | null;
  now?: Date;
}) {
  const actorId = await requireModerator(input);
  const reason = parseModerationReason(input.reason);

  const comment = await input.comments.findForModeration(input.commentId);
  if (!comment) throw new ModerationError("TARGET_NOT_FOUND");

  const from = comment.moderationState as CommentModerationState;
  if (!canTransitionComment(from, input.to).ok) {
    throw new ModerationError("ILLEGAL_TRANSITION");
  }

  await input.comments.setModerationState(input.commentId, input.to);

  await input.reports.recordCommentAction({
    commentId: input.commentId,
    fromValue: from,
    toValue: input.to,
    actorId,
    reportId: input.reportId ?? null,
    reason,
  });

  await input.reports.resolveOpenForTarget({
    commentId: input.commentId,
    // Acting on the content is what "actioned" means. Restoring it — moving
    // back to VISIBLE — answers the reports the other way.
    status: input.to === "VISIBLE" ? "DISMISSED" : "ACTIONED",
    resolvedBy: actorId,
    note: reason,
    now: input.now ?? new Date(),
  });

  return {
    id: input.commentId,
    moderationState: input.to,
    productSlug: comment.productSlug,
  };
}

/**
 * Moderates a product and closes the reports that asked for it.
 *
 * The state change goes through the product service's own rule
 * (`canTransitionModeration`) and lands in `product_status_history`, where it
 * sits on one timeline with the owner's publication and status changes. That is
 * ADR-013's design and the reason this does not write its own audit row.
 *
 * A moderator action **never** touches `failure_status` or
 * `publication_state`. Those are the founder's own account of their product and
 * their own decision to publish it; moving them from here would be the site
 * putting words in somebody's mouth.
 */
export async function moderateProduct(input: {
  reports: ReportRepository;
  products: ProductRepository;
  users: { findRole(id: string): Promise<string | null> };
  viewer: ModerationViewer;
  productId: string;
  to: ModerationState;
  reason: unknown;
  reportId?: string | null;
  now?: Date;
}) {
  const actorId = await requireModerator(input);
  const reason = parseModerationReason(input.reason);

  const product = await input.products.findForAuthorization(input.productId);
  if (!product) throw new ModerationError("TARGET_NOT_FOUND");

  const from = product.moderationState as ModerationState;
  if (!canTransitionModeration(from, input.to, "MODERATOR").ok) {
    throw new ModerationError("ILLEGAL_TRANSITION");
  }

  await input.products.setModerationState(input.productId, input.to);

  await input.products.recordStatusChange({
    productId: input.productId,
    axis: "MODERATION",
    fromValue: from,
    toValue: input.to,
    actorId,
    actorRole: "MODERATOR",
    reason,
  });

  await input.reports.resolveOpenForTarget({
    productId: input.productId,
    status: input.to === "NONE" ? "DISMISSED" : "ACTIONED",
    resolvedBy: actorId,
    note: reason,
    now: input.now ?? new Date(),
  });

  return {
    id: input.productId,
    moderationState: input.to,
    slug: product.slug,
  };
}

/**
 * Closes a report without touching the content.
 *
 * The commonest outcome in any moderation queue: somebody reported something
 * that does not breach the guidelines. It still has to be recorded — a report
 * that quietly disappears from the queue is indistinguishable from one nobody
 * ever read.
 */
export async function resolveReport(input: {
  reports: ReportRepository;
  users: { findRole(id: string): Promise<string | null> };
  viewer: ModerationViewer;
  reportId: string;
  status: unknown;
  note: unknown;
  now?: Date;
}) {
  const actorId = await requireModerator(input);

  if (input.status !== "ACTIONED" && input.status !== "DISMISSED") {
    throw new ModerationError("ILLEGAL_TRANSITION");
  }

  const note = parseModerationReason(input.note);

  const report = await input.reports.findById(input.reportId);
  if (!report) throw new ModerationError("REPORT_NOT_FOUND");

  const closed = await input.reports.resolve({
    id: input.reportId,
    status: input.status,
    resolvedBy: actorId,
    note,
    now: input.now ?? new Date(),
  });

  // Not an error the moderator caused: somebody else closed it first. Saying so
  // is more useful than a generic failure.
  if (!closed) throw new ModerationError("ALREADY_RESOLVED");

  return { id: input.reportId, status: input.status };
}
