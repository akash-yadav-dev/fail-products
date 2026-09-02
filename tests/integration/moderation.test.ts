// tests/integration/moderation.test.ts
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { comments, products, reports, users } from "@/db/schema";
import { CommentRepository } from "@/repositories/comment-repository";
import { ProductRepository } from "@/repositories/product-repository";
import { RateLimitRepository } from "@/repositories/rate-limit-repository";
import { ReportRepository } from "@/repositories/report-repository";
import { UserRepository } from "@/repositories/user-repository";
import {
  fileReport,
  listModerationLog,
  listReports,
  moderateComment,
  moderateProduct,
  resolveReport,
} from "@/services/moderation/moderation-service";
import { listComments } from "@/services/comment/comment-service";
import { DatabaseRateLimiter } from "@/services/security/rate-limit";
import { noDatabase, testDb, unique } from "./database";

/**
 * Reporting and moderation (Phase 3 slices 3.3 and 3.4).
 *
 * The rules asserted here are the ones the Phase 3 exit gate names:
 * duplicate reports collapse, actions are authorised server-side and audited,
 * hidden content leaves the public surface, and a moderator action never
 * changes a product's factual status.
 */

describe.skipIf(noDatabase)("reporting and moderation", () => {
  const db = noDatabase ? null : testDb();
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];

  function deps() {
    return {
      reports: new ReportRepository(db!),
      comments: new CommentRepository(db!),
      products: new ProductRepository(db!),
      users: new UserRepository(db!),
      rateLimiter: new DatabaseRateLimiter(new RateLimitRepository(db!)),
    };
  }

  async function account(role: "MEMBER" | "MODERATOR" = "MEMBER") {
    const handle = unique("mod");
    const [row] = await db!
      .insert(users)
      .values({
        username: handle,
        usernameLower: handle.toLowerCase(),
        email: `${handle}@example.test`,
        role,
      })
      .returning();

    createdUserIds.push(row!.id);
    return row!.id;
  }

  async function product(state: Partial<typeof products.$inferInsert> = {}) {
    const [row] = await db!
      .insert(products)
      .values({
        ownerId: await account(),
        slug: unique("mod-fixture"),
        name: "Moderation fixture",
        failureStatus: "ABANDONED",
        publicationState: "PUBLISHED",
        moderationState: "NONE",
        publishedAt: new Date(),
        ...state,
      })
      .returning();

    createdProductIds.push(row!.id);
    return row!;
  }

  async function comment(productId: string) {
    const [row] = await db!
      .insert(comments)
      .values({
        productId,
        authorId: await account(),
        body: "This never worked for me on mobile.",
      })
      .returning();

    return row!;
  }

  afterAll(async () => {
    if (!db) return;
    if (createdProductIds.length) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  // -------------------------------------------------------------------------
  // Filing
  // -------------------------------------------------------------------------

  it("files a report against a product", async () => {
    const listing = await product();
    const reporter = await account();

    const filed = await fileReport({
      ...deps(),
      viewer: { userId: reporter },
      targetType: "PRODUCT",
      targetId: listing.id,
      reason: "SCAM_OR_MALWARE",
      detail: "The download link installs something else.",
    });

    expect(filed.created).toBe(true);
    expect(filed.productSlug).toBe(listing.slug);
  });

  it("collapses a duplicate report from the same account", async () => {
    // The rule the Phase 3 plan names. One account reporting the same target
    // twice is somebody who did not see their first report, not an attack.
    const listing = await product();
    const reporter = await account();

    const first = await fileReport({
      ...deps(),
      viewer: { userId: reporter },
      targetType: "PRODUCT",
      targetId: listing.id,
      reason: "SPAM",
      detail: null,
    });
    const second = await fileReport({
      ...deps(),
      viewer: { userId: reporter },
      targetType: "PRODUCT",
      targetId: listing.id,
      reason: "HARASSMENT",
      detail: "changed my mind about the reason",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);

    const rows = await db!
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.productId, listing.id));
    expect(rows).toHaveLength(1);
  });

  it("keeps two different accounts' reports on one target separate", async () => {
    // The half a naive "one report per target" rule would break. Five people
    // reporting the same comment is the signal the queue exists to surface.
    const listing = await product();

    await fileReport({
      ...deps(),
      viewer: { userId: await account() },
      targetType: "PRODUCT",
      targetId: listing.id,
      reason: "SPAM",
      detail: null,
    });
    await fileReport({
      ...deps(),
      viewer: { userId: await account() },
      targetType: "PRODUCT",
      targetId: listing.id,
      reason: "SPAM",
      detail: null,
    });

    const rows = await db!
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.productId, listing.id));
    expect(rows).toHaveLength(2);
  });

  it("lets one account report a product and a comment on it separately", async () => {
    // The two partial unique indexes have to be independent. A single index
    // over both columns would collapse these into one.
    const listing = await product();
    const posted = await comment(listing.id);
    const reporter = await account();

    const onProduct = await fileReport({
      ...deps(),
      viewer: { userId: reporter },
      targetType: "PRODUCT",
      targetId: listing.id,
      reason: "INCORRECT_INFORMATION",
      detail: null,
    });
    const onComment = await fileReport({
      ...deps(),
      viewer: { userId: reporter },
      targetType: "COMMENT",
      targetId: posted.id,
      reason: "HARASSMENT",
      detail: null,
    });

    expect(onProduct.created).toBe(true);
    expect(onComment.created).toBe(true);
  });

  it("refuses a signed-out reporter", async () => {
    const listing = await product();

    await expect(
      fileReport({
        ...deps(),
        viewer: { userId: null },
        targetType: "PRODUCT",
        targetId: listing.id,
        reason: "SPAM",
        detail: null,
      })
    ).rejects.toMatchObject({ code: "NOT_SIGNED_IN" });
  });

  it("refuses a reason nobody defined", async () => {
    const listing = await product();

    await expect(
      fileReport({
        ...deps(),
        viewer: { userId: await account() },
        targetType: "PRODUCT",
        targetId: listing.id,
        reason: "I_JUST_DONT_LIKE_IT",
        detail: null,
      })
    ).rejects.toMatchObject({ code: "INVALID_REASON" });
  });

  it("refuses a target that does not exist", async () => {
    await expect(
      fileReport({
        ...deps(),
        viewer: { userId: await account() },
        targetType: "PRODUCT",
        targetId: "00000000-0000-7000-8000-000000000000",
        reason: "SPAM",
        detail: null,
      })
    ).rejects.toMatchObject({ code: "TARGET_NOT_FOUND" });
  });

  // -------------------------------------------------------------------------
  // Authorization
  // -------------------------------------------------------------------------

  it("refuses the queue to an account without the role", async () => {
    await expect(
      listReports({ ...deps(), viewer: { userId: await account("MEMBER") } })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses the queue to a signed-out visitor", async () => {
    await expect(
      listReports({ ...deps(), viewer: { userId: null } })
    ).rejects.toMatchObject({ code: "NOT_SIGNED_IN" });
  });

  it("refuses every moderation action to an account without the role", async () => {
    // One assertion per entry point. A role check that covers the queue but
    // not the action is a dashboard that only looks authorised.
    const listing = await product();
    const posted = await comment(listing.id);
    const member = await account("MEMBER");

    await expect(
      moderateComment({
        ...deps(),
        viewer: { userId: member },
        commentId: posted.id,
        to: "HIDDEN",
        reason: "no",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      moderateProduct({
        ...deps(),
        viewer: { userId: member },
        productId: listing.id,
        to: "HIDDEN",
        reason: "no",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      listModerationLog({ ...deps(), viewer: { userId: member } })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reads the role from the database, not from the caller", async () => {
    // The property that matters when a moderator is demoted: the next action
    // fails, rather than the next sign-in.
    const listing = await product();
    const posted = await comment(listing.id);
    const moderator = await account("MODERATOR");

    await moderateComment({
      ...deps(),
      viewer: { userId: moderator },
      commentId: posted.id,
      to: "HIDDEN",
      reason: "Targets the founder personally.",
    });

    await db!
      .update(users)
      .set({ role: "MEMBER" })
      .where(eq(users.id, moderator));

    await expect(
      moderateComment({
        ...deps(),
        viewer: { userId: moderator },
        commentId: posted.id,
        to: "VISIBLE",
        reason: "second thoughts",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses an action with no stated reason", async () => {
    const listing = await product();
    const posted = await comment(listing.id);

    await expect(
      moderateComment({
        ...deps(),
        viewer: { userId: await account("MODERATOR") },
        commentId: posted.id,
        to: "HIDDEN",
        reason: "   ",
      })
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
  });

  // -------------------------------------------------------------------------
  // Acting
  // -------------------------------------------------------------------------

  it("takes a hidden comment off the public page and records who did it", async () => {
    const listing = await product();
    const posted = await comment(listing.id);
    const moderator = await account("MODERATOR");
    const dependencies = deps();

    await moderateComment({
      ...dependencies,
      viewer: { userId: moderator },
      commentId: posted.id,
      to: "HIDDEN",
      reason: "Publishes the founder's home address.",
    });

    const page = await listComments({
      repository: dependencies.comments,
      productId: listing.id,
    });
    expect(page.items).toEqual([]);

    const history = await dependencies.reports.listCommentHistory(posted.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromValue: "VISIBLE",
      toValue: "HIDDEN",
      reason: "Publishes the founder's home address.",
    });
  });

  it("closes the reports that asked for the action", async () => {
    const listing = await product();
    const posted = await comment(listing.id);
    const dependencies = deps();

    await fileReport({
      ...dependencies,
      viewer: { userId: await account() },
      targetType: "COMMENT",
      targetId: posted.id,
      reason: "PRIVACY",
      detail: null,
    });
    await fileReport({
      ...dependencies,
      viewer: { userId: await account() },
      targetType: "COMMENT",
      targetId: posted.id,
      reason: "HARASSMENT",
      detail: null,
    });

    await moderateComment({
      ...dependencies,
      viewer: { userId: await account("MODERATOR") },
      commentId: posted.id,
      to: "HIDDEN",
      reason: "Doxxing.",
    });

    const rows = await db!
      .select({ status: reports.status })
      .from(reports)
      .where(eq(reports.commentId, posted.id));

    expect(rows.map((row) => row.status)).toEqual(["ACTIONED", "ACTIONED"]);
  });

  it("dismisses the reports when the moderator restores the content", async () => {
    const listing = await product();
    const posted = await comment(listing.id);
    const dependencies = deps();
    const moderator = await account("MODERATOR");

    await moderateComment({
      ...dependencies,
      viewer: { userId: moderator },
      commentId: posted.id,
      to: "HIDDEN",
      reason: "Looked like doxxing.",
    });

    await fileReport({
      ...dependencies,
      viewer: { userId: await account() },
      targetType: "COMMENT",
      targetId: posted.id,
      reason: "PRIVACY",
      detail: null,
    });

    await moderateComment({
      ...dependencies,
      viewer: { userId: moderator },
      commentId: posted.id,
      to: "VISIBLE",
      reason: "It was the founder's own public support address.",
    });

    const rows = await db!
      .select({ status: reports.status })
      .from(reports)
      .where(eq(reports.commentId, posted.id));
    expect(rows.map((row) => row.status)).toEqual(["DISMISSED"]);

    // And the comment is readable again. A takedown has to be undoable, or the
    // correction happens by direct database edit and nothing records it.
    const page = await listComments({
      repository: dependencies.comments,
      productId: listing.id,
    });
    expect(page.items.map((item) => item.id)).toEqual([posted.id]);
  });

  it("never changes a product's factual status when it moderates it", async () => {
    // ADR-013's load-bearing rule, and a Phase 3 exit-gate item. A takedown
    // must not rewrite the founder's own account of what happened to their
    // product, nor their decision to publish it.
    const listing = await product({ failureStatus: "RECOVERING" });
    const dependencies = deps();

    await moderateProduct({
      ...dependencies,
      viewer: { userId: await account("MODERATOR") },
      productId: listing.id,
      to: "HIDDEN",
      reason: "Impersonates another company.",
    });

    const [row] = await db!
      .select({
        failureStatus: products.failureStatus,
        publicationState: products.publicationState,
        moderationState: products.moderationState,
      })
      .from(products)
      .where(eq(products.id, listing.id));

    expect(row).toEqual({
      failureStatus: "RECOVERING",
      publicationState: "PUBLISHED",
      moderationState: "HIDDEN",
    });
  });

  it("records a product moderation on the product's own timeline", async () => {
    // Not in comment_status_history. ADR-013 keeps one timeline per product,
    // covering the owner's changes and the moderator's, and a second log would
    // be a second version of the same story.
    const listing = await product();
    const dependencies = deps();
    const moderator = await account("MODERATOR");

    await moderateProduct({
      ...dependencies,
      viewer: { userId: moderator },
      productId: listing.id,
      to: "FLAGGED",
      reason: "Two reports about the download link.",
    });

    const history = await dependencies.products.listStatusHistory(listing.id);
    const moderation = history.filter((entry) => entry.axis === "MODERATION");

    expect(moderation).toHaveLength(1);
    expect(moderation[0]).toMatchObject({
      fromValue: "NONE",
      toValue: "FLAGGED",
      actorRole: "MODERATOR",
      reason: "Two reports about the download link.",
    });
  });

  it("refuses a transition the state machine does not allow", async () => {
    const listing = await product();
    const posted = await comment(listing.id);

    await expect(
      moderateComment({
        ...deps(),
        viewer: { userId: await account("MODERATOR") },
        commentId: posted.id,
        to: "VISIBLE",
        reason: "it already is",
      })
    ).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
  });

  // -------------------------------------------------------------------------
  // The queue
  // -------------------------------------------------------------------------

  it("shows an open report to a moderator and drops it once resolved", async () => {
    const listing = await product();
    const dependencies = deps();
    const moderator = await account("MODERATOR");

    const filed = await fileReport({
      ...dependencies,
      viewer: { userId: await account() },
      targetType: "PRODUCT",
      targetId: listing.id,
      reason: "SPAM",
      detail: null,
    });

    const before = await listReports({
      ...dependencies,
      viewer: { userId: moderator },
    });
    expect(before.items.map((item) => item.id)).toContain(filed.id);

    await resolveReport({
      ...dependencies,
      viewer: { userId: moderator },
      reportId: filed.id,
      status: "DISMISSED",
      note: "Reads as ordinary criticism.",
    });

    const after = await listReports({
      ...dependencies,
      viewer: { userId: moderator },
    });
    expect(after.items.map((item) => item.id)).not.toContain(filed.id);
  });

  it("refuses a second resolution of the same report", async () => {
    // Two moderators closing one report at once. The second must be told,
    // rather than silently overwriting the first one's note and timestamp.
    const listing = await product();
    const dependencies = deps();
    const moderator = await account("MODERATOR");

    const filed = await fileReport({
      ...dependencies,
      viewer: { userId: await account() },
      targetType: "PRODUCT",
      targetId: listing.id,
      reason: "SPAM",
      detail: null,
    });

    await resolveReport({
      ...dependencies,
      viewer: { userId: moderator },
      reportId: filed.id,
      status: "DISMISSED",
      note: "Ordinary criticism.",
    });

    await expect(
      resolveReport({
        ...dependencies,
        viewer: { userId: moderator },
        reportId: filed.id,
        status: "ACTIONED",
        note: "changed my mind",
      })
    ).rejects.toMatchObject({ code: "ALREADY_RESOLVED" });
  });

  it("anonymises a reporter on account deletion without losing the report", async () => {
    // docs/LEGAL.md §5: the reporter is anonymised and the report is retained
    // for twelve months, because its value to abuse-pattern detection does not
    // depend on who filed it.
    //
    // The case worth pinning is the index, not the column. Two deleted
    // reporters on one product leave two rows reading (NULL, product) under a
    // unique index — which Postgres permits, because it treats NULLs as
    // distinct, and which would be a constraint violation on deletion if the
    // index had been written any other way.
    const listing = await product();
    const dependencies = deps();
    const first = await account();
    const second = await account();

    await fileReport({
      ...dependencies,
      viewer: { userId: first },
      targetType: "PRODUCT",
      targetId: listing.id,
      reason: "SPAM",
      detail: null,
    });
    await fileReport({
      ...dependencies,
      viewer: { userId: second },
      targetType: "PRODUCT",
      targetId: listing.id,
      reason: "SPAM",
      detail: null,
    });

    await db!.delete(users).where(inArray(users.id, [first, second]));

    const rows = await db!
      .select({ reporterId: reports.reporterId, reason: reports.reason })
      .from(reports)
      .where(eq(reports.productId, listing.id));

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.reporterId === null)).toBe(true);
  });

  it("keeps reports about listings that are already hidden", async () => {
    // A queue filtered by public visibility would drop exactly the reports an
    // appeal is about.
    const listing = await product({ moderationState: "HIDDEN" });
    const dependencies = deps();

    const filed = await fileReport({
      ...dependencies,
      viewer: { userId: await account() },
      targetType: "PRODUCT",
      targetId: listing.id,
      reason: "INCORRECT_INFORMATION",
      detail: null,
    });

    const queue = await listReports({
      ...dependencies,
      viewer: { userId: await account("MODERATOR") },
    });

    expect(queue.items.map((item) => item.id)).toContain(filed.id);
  });
});
