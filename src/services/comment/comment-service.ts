// src/services/comment/comment-service.ts
import { MAX_COMMENT_LENGTH, parseCommentBody } from "@/domain/comment/body";
import type { RateLimiter } from "@/lib/security/rate-limit";
import type { CommentRepository } from "@/repositories/comment-repository";
import { RATE_LIMITS } from "@/services/security/rate-limit";

/**
 * Comment use cases.
 *
 * Every mutation follows the order `AGENTS.md` §7 requires:
 * parse → validate → authenticate → authorize → rate-limit → domain → persist
 * → safe response. The repository and the limiter are injected rather than
 * imported so these run against a test database with no framework near them.
 *
 * The order is not cosmetic. Rate limiting sits **after** authorization so a
 * signed-out attacker cannot spend a signed-in account's allowance by guessing
 * at ids, and **before** the write so the limit is enforced by refusing work
 * rather than by counting work already done.
 */

export type CommentServiceError =
  | "NOT_SIGNED_IN"
  | "PRODUCT_NOT_FOUND"
  | "COMMENT_NOT_FOUND"
  | "EMPTY"
  | "TOO_LONG"
  | "RATE_LIMITED"
  | "FORBIDDEN"
  | "ILLEGAL_TRANSITION";

export class CommentError extends Error {
  constructor(
    readonly code: CommentServiceError,
    /** Epoch milliseconds, when the code is RATE_LIMITED. */
    readonly resetAt?: number
  ) {
    super(code);
    this.name = "CommentError";
  }
}

/** Re-exported so an action can name the limit without reaching into domain/. */
export { MAX_COMMENT_LENGTH };

/** How many comments one page of a discussion shows. */
export const COMMENT_PAGE_SIZE = 50;

export type CommentViewer = {
  /** Null when signed out. Never read from a form field (`AGENTS.md` §7). */
  readonly userId: string | null;
  readonly isModerator?: boolean;
};

/**
 * Posts a comment on a published product.
 *
 * The product is re-loaded through `findCommentableProduct`, which applies the
 * public-visibility predicate as a SQL filter. That is the authorization step:
 * a draft, archived, hidden, or removed listing has no public discussion, and a
 * `product_id` in a form body is an assertion by the caller rather than a fact.
 */
export async function postComment(input: {
  repository: CommentRepository;
  rateLimiter: RateLimiter;
  viewer: CommentViewer;
  productId: string;
  body: unknown;
}) {
  const parsed = parseCommentBody(input.body);
  if (!parsed.ok) throw new CommentError(parsed.reason);

  if (!input.viewer.userId) throw new CommentError("NOT_SIGNED_IN");
  const authorId = input.viewer.userId;

  const product = await input.repository.findCommentableProduct(
    input.productId
  );
  if (!product) throw new CommentError("PRODUCT_NOT_FOUND");

  const decision = await input.rateLimiter.consume(
    RATE_LIMITS.commentPost,
    authorId
  );
  if (!decision.allowed) {
    throw new CommentError("RATE_LIMITED", decision.resetAt);
  }

  const created = await input.repository.create({
    productId: product.id,
    authorId,
    body: parsed.body,
  });
  if (!created) throw new CommentError("PRODUCT_NOT_FOUND");

  return { id: created.id, productSlug: product.slug };
}

/**
 * A product's public discussion, bounded.
 *
 * **One page, no cursor.** The product page that renders this is prerendered
 * and cached (ADR-027), and a `?cursor=` link on it would make the whole route
 * dynamic again — which is the launch-blocking cache metric in
 * `docs/DEPLOYMENT.md` §11, spent on a page-two link no listing needs yet.
 *
 * `hasMore` is returned so the page can say it is showing the first fifty
 * rather than pretend fifty is all there are. A listing that overflows this is
 * the measurement that justifies building pagination — `CLAUDE.md` §7 — and
 * until then the keyset the repository already implements is what makes adding
 * it a small change rather than a rewrite.
 */
export async function listComments(input: {
  repository: CommentRepository;
  productId: string;
}) {
  return input.repository.listPublicForProduct(input.productId, {
    limit: COMMENT_PAGE_SIZE,
  });
}
