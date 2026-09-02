// src/db/queries/comment-visibility.ts
import { and, inArray, type SQL } from "drizzle-orm";

import { comments } from "@/db/schema/comments";
import { publiclyVisibleProduct } from "@/db/queries/product-visibility";
import { PUBLIC_COMMENT_STATES } from "@/domain/comment/moderation";

/**
 * The comment half of public visibility.
 *
 * An `IN` over the allowlist rather than a `NOT IN` over the hidden states.
 * `docs/MODERATION.md` §6 defines four states and exactly one is public, so a
 * fifth added later is invisible by default instead of public by default —
 * which is the only direction it is safe to be wrong in.
 */
export const publiclyVisibleCommentState: SQL = inArray(
  comments.moderationState,
  [...PUBLIC_COMMENT_STATES]
);

/**
 * The predicate every public comment query must carry.
 *
 * The same shape as `publiclyVisibleProduct`, and written once for the same
 * reason: so a new query cannot ship with half the filter.
 *
 * It carries the **product's** visibility as well as the comment's. A comment
 * on a listing that has since been hidden or unpublished must not surface
 * anywhere, and relying on every caller to have already checked the product is
 * the assumption that ends with a profile page or a feed leaking one. Any
 * query using this must join `products`.
 */
export const publiclyVisibleComment: SQL = and(
  publiclyVisibleCommentState,
  publiclyVisibleProduct
)!;
