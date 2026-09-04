// src/services/comment/server-comment.ts
import { getDb } from "@/db";
import { canSkipDatabaseAtBuild } from "@/lib/config/database";
import { CommentRepository } from "@/repositories/comment-repository";
import { RateLimitRepository } from "@/repositories/rate-limit-repository";
import {
  listComments as listCommentsUseCase,
  postComment as postCommentUseCase,
} from "@/services/comment/comment-service";
import { DatabaseRateLimiter } from "@/services/security/rate-limit";

/**
 * The server-side binding for the comment use cases.
 *
 * Pages and Server Actions call these; the use cases themselves stay free of
 * `getDb` so tests can supply their own database. Mirrors
 * `src/services/product/server-product.ts`.
 */

function repository() {
  return new CommentRepository(getDb());
}

function rateLimiter() {
  return new DatabaseRateLimiter(new RateLimitRepository(getDb()));
}

type Without<T> = Omit<T, "repository" | "rateLimiter">;

export function postComment(
  input: Without<Parameters<typeof postCommentUseCase>[0]>
) {
  return postCommentUseCase({
    ...input,
    repository: repository(),
    rateLimiter: rateLimiter(),
  });
}

/**
 * A product's discussion, with the same build guard as the directory list.
 *
 * `/products/[slug]` is prerendered, so this runs during `next build`, and CI
 * builds without a database on purpose.
 */
export function listComments(
  input: Without<Parameters<typeof listCommentsUseCase>[0]>
) {
  if (canSkipDatabaseAtBuild()) {
    return Promise.resolve({ items: [], hasMore: false });
  }

  return listCommentsUseCase({ ...input, repository: repository() });
}

/**
 * How much discussion one owner's listings carry, as a single number.
 *
 * This is the caller `countPublicForProduct` was kept for -- the overview,
 * where one total is the whole question. It is still not a per-card count.
 */
export function countCommentsAcross(productIds: readonly string[]) {
  if (productIds.length === 0) return Promise.resolve(0);
  return repository().countPublicByProducts(productIds);
}

// Deleted: `countComments`. Nothing called it. The count it wraps
// (`CommentRepository.countPublicForProduct`) is kept and still covered by
// tests/integration/comment-visibility.test.ts, because it is the read a
// comment count on a product card would need — but the binding is added back
// when something renders one, not left standing in case it does. See
// docs/PRODUCT.md §5 on why the count is not on a card today.
