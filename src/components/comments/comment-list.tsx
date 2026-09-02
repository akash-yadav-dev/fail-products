// src/components/comments/comment-list.tsx
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { CommentBody } from "@/components/comments/comment-body";

/**
 * A product's discussion.
 *
 * Server-rendered on the cached product page rather than fetched by the
 * browser, because a discussion is content: `docs/PRODUCT.md` §9 requires
 * meaningful visible content without JavaScript dependence, and a comment
 * thread that only exists after hydration is invisible to a crawler and to
 * anyone whose script did not load.
 */

export type CommentListItem = {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string | null;
  authorUsername: string | null;
  authorDisplayName: string | null;
};

export function CommentList({
  comments,
  productOwnerId,
}: {
  comments: readonly CommentListItem[];
  /** Null on an anonymised listing. Drives the founder indicator. */
  productOwnerId: string | null;
}) {
  if (comments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        No comments yet. If you used this product, what actually went wrong?
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-6">
      {comments.map((comment) => {
        // Derived, never stored. A column would be a snapshot of who owned the
        // listing at the moment the comment was written, and would keep saying
        // "founder" after the listing changed hands or was anonymised.
        const isFounder =
          productOwnerId !== null && comment.authorId === productOwnerId;

        return (
          <li
            key={comment.id}
            className="flex flex-col gap-2 border-b border-border/60 pb-6 last:border-0 last:pb-0"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {comment.authorUsername ? (
                <Link
                  href={`/u/${comment.authorUsername}`}
                  className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {comment.authorDisplayName ?? `@${comment.authorUsername}`}
                </Link>
              ) : (
                // docs/LEGAL.md §5: a deleted account's comments are
                // anonymised, not erased — removing them destroys the context
                // every comment around them depends on.
                <span className="font-medium text-muted-foreground">
                  Deleted account
                </span>
              )}

              {isFounder ? (
                // docs/PRODUCT.md §5 asks for a founder reply indicator. On a
                // page of criticism about somebody's product, knowing which
                // voice is theirs is most of what makes the thread readable.
                <Badge variant="secondary">Founder</Badge>
              ) : null}

              <time
                dateTime={comment.createdAt.toISOString()}
                className="text-muted-foreground"
              >
                {comment.createdAt.toISOString().slice(0, 10)}
              </time>
            </div>

            <CommentBody body={comment.body} />
          </li>
        );
      })}
    </ul>
  );
}
