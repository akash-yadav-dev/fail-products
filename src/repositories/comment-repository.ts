// src/repositories/comment-repository.ts
import { and, asc, count, eq, inArray, or, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { publiclyVisibleComment } from "@/db/queries/comment-visibility";
import { publiclyVisibleProduct } from "@/db/queries/product-visibility";
import { comments, products, users } from "@/db/schema";
import type { CommentModerationState } from "@/domain/comment/moderation";

/**
 * Comment persistence.
 *
 * Every public read goes through `publiclyVisibleComment`, which carries both
 * the comment's state and the product's, rather than restating either filter
 * per query. The safe version is the only one available here — the same rule
 * `ProductRepository` follows, for the same reason.
 */

/**
 * Columns a public comment needs.
 *
 * `authorId` is included and `moderationState` is not. The first is what makes
 * the founder-reply indicator possible without a second query; the second is
 * not a fact the public page has any use for, and a state a page never renders
 * is a state a page cannot leak.
 */
const publicColumns = {
  id: comments.id,
  productId: comments.productId,
  body: comments.body,
  createdAt: comments.createdAt,
  authorId: comments.authorId,
  authorUsername: users.username,
  authorDisplayName: users.displayName,
} as const;

export type PublicComment = Awaited<
  ReturnType<CommentRepository["listPublicForProduct"]>
>["items"][number];

export class CommentRepository {
  constructor(private readonly db: Database) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /**
   * One page of a product's public discussion, oldest first.
   *
   * Oldest first because a discussion is read as a conversation; newest-first
   * would put replies above what they reply to. The cursor is a keyset on
   * `(created_at, id)` for the same reason the product list uses one — two
   * comments posted in the same second are ordinary, and a tie straddling a
   * page boundary is where offset pagination drops or repeats a row.
   */
  // The `after` branch below is written as `created_at > X OR (created_at = X
  // AND id > Y)`. That is not a single index range scan, and
  // `comments_product_created_idx` is `(product_id, created_at)` without `id`,
  // so the tiebreak needs a sort the index cannot supply. It is unreachable
  // today — `listComments` never passes `after` — which is why it is recorded
  // rather than fixed: an index change with no live query behind it cannot be
  // measured. When comment pagination ships, the predicate becomes the
  // row-value form `(created_at, id) > (X, Y)` and the index extends to
  // `(product_id, created_at, id)`, in that same commit.
  async listPublicForProduct(
    productId: string,
    options: { limit: number; after?: { createdAt: Date; id: string } | null }
  ) {
    const rows = await this.db
      .select(publicColumns)
      .from(comments)
      .innerJoin(products, eq(comments.productId, products.id))
      .leftJoin(users, eq(comments.authorId, users.id))
      .where(
        and(
          eq(comments.productId, productId),
          publiclyVisibleComment,
          options.after
            ? or(
                sql`${comments.createdAt} > ${options.after.createdAt}`,
                and(
                  eq(comments.createdAt, options.after.createdAt),
                  sql`${comments.id} > ${options.after.id}`
                )
              )
            : undefined
        )
      )
      .orderBy(asc(comments.createdAt), asc(comments.id))
      // One more than the page shows: the extra row is the whole answer to "is
      // there another page?", so no second COUNT is billed for it.
      .limit(options.limit + 1);

    const hasMore = rows.length > options.limit;

    return { items: hasMore ? rows.slice(0, options.limit) : rows, hasMore };
  }

  /**
   * Public comments across a set of listings, as one total.
   *
   * The owner's overview asks "how much discussion do my listings have", which
   * is one number and one query. It is not the per-card count: that would be
   * an aggregate on the hottest query in the application, and
   * `docs/DESIGN.md` §7 records why it is not paid for yet.
   */
  async countPublicByProducts(productIds: readonly string[]): Promise<number> {
    if (productIds.length === 0) return 0;

    const [row] = await this.db
      .select({ total: count() })
      .from(comments)
      .innerJoin(products, eq(comments.productId, products.id))
      .where(and(inArray(comments.productId, [...productIds]), publiclyVisibleComment));

    return row?.total ?? 0;
  }

  /** How many public comments a product has. Drives the heading and the sort. */
  async countPublicForProduct(productId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(comments)
      .innerJoin(products, eq(comments.productId, products.id))
      .where(and(eq(comments.productId, productId), publiclyVisibleComment));

    return row?.total ?? 0;
  }

  /**
   * A comment for an authorization or moderation decision.
   *
   * Deliberately unfiltered by visibility: a moderator acting on a hidden
   * comment needs the real row. `AGENTS.md` §7 requires authorization to
   * re-load the record server-side rather than trust anything from the request,
   * and the product's owner comes back with it so "is this the founder?" and
   * "may this account act here?" are answered from one read.
   */
  async findForModeration(id: string) {
    const [row] = await this.db
      .select({
        id: comments.id,
        productId: comments.productId,
        productSlug: products.slug,
        productOwnerId: products.ownerId,
        authorId: comments.authorId,
        body: comments.body,
        moderationState: comments.moderationState,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .innerJoin(products, eq(comments.productId, products.id))
      .where(eq(comments.id, id))
      .limit(1);

    return row ?? null;
  }

  /**
   * The product a comment may be posted on, or null.
   *
   * Filtered by `publiclyVisibleProduct` through the shared predicate: a draft,
   * archived, hidden, or removed listing has no public discussion to join, and
   * checking that here rather than in the service means the check is a SQL
   * filter rather than a post-fetch comparison somebody can forget.
   */
  async findCommentableProduct(productId: string) {
    const [row] = await this.db
      .select({ id: products.id, slug: products.slug, ownerId: products.ownerId })
      .from(products)
      // The product half of the shared predicate, on its own: there is no
      // comment row here to apply the other half to.
      .where(and(eq(products.id, productId), publiclyVisibleProduct))
      .limit(1);

    return row ?? null;
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  async create(input: {
    productId: string;
    authorId: string;
    body: string;
  }) {
    const [row] = await this.db
      .insert(comments)
      .values(input)
      .returning({ id: comments.id, createdAt: comments.createdAt });

    return row ?? null;
  }

  async setModerationState(id: string, to: CommentModerationState) {
    await this.db
      .update(comments)
      .set({ moderationState: to })
      .where(eq(comments.id, id));
  }

  // Deleted: `listByModerationState`. It shipped with Phase 3 and never had a
  // caller — the queue reads `reports`, not comments by state — and it
  // filtered `comments.moderation_state`, which carries no index, so the
  // first code to wire it up would have got a sequential scan of the comments
  // table for free. Adding the index now instead would be the mirror-image
  // defect: an index with no access pattern behind it. When a moderator view
  // of comments by state is actually built, it arrives with its own index in
  // the same commit.
}
