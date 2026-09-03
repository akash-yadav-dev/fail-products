// src/components/comments/comment-list.tsx
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { CommentBody } from "@/components/comments/comment-body";
import { ReportDialog } from "@/components/comments/report-dialog";
import type { FormActionState } from "@/lib/forms/action-state";

/**
 * A product's discussion.
 *
 * Server-rendered on the cached product page rather than fetched by the
 * browser, because a discussion is content: `docs/PRODUCT.md` §9 requires
 * meaningful visible content without JavaScript dependence, and a comment
 * thread that only exists after hydration is invisible to a crawler and to
 * anyone whose script did not load.
 *
 * **One `ReportDialog` client island is mounted per comment**, up to
 * `COMMENT_PAGE_SIZE`. The Phase 3 performance audit raised this (PERF-3) and
 * it is knowingly left as it is. The markup cost is one button per row — the
 * dialog body is portal-mounted only on open, verified in the served HTML —
 * so what it actually costs is hydration work and flight payload, i.e. INP.
 *
 * Collapsing it to one dialog per thread needs the "which comment is open"
 * state, and this component is a **server** component precisely so the thread
 * is crawlable. Holding that state here would move the whole discussion into
 * the client bundle and undo the property above; holding it in a provider
 * still leaves one small client component per row to trigger it. Either way
 * the saving could not be measured — the database holds zero comments, so
 * there is no thread to profile.
 *
 * The trigger for revisiting: the first listing whose discussion approaches
 * `COMMENT_PAGE_SIZE`. That is the same measurement that forces comment
 * pagination, and both changes belong in the same piece of work.
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
  reportAction,
  turnstileSiteKey,
}: {
  comments: readonly CommentListItem[];
  /** Null on an anonymised listing. Drives the founder indicator. */
  productOwnerId: string | null;
  reportAction: (
    state: FormActionState | null,
    formData: FormData
  ) => Promise<FormActionState>;
  turnstileSiteKey: string | null;
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
            // The anchor a moderation queue entry links to. A borderline call
            // is mostly decided by the thread around the quoted fragment, and
            // without an id here there was no way to reach it.
            id={comment.id}
            className="flex scroll-mt-24 flex-col gap-2 border-b border-border/60 pb-6 last:border-0 last:pb-0"
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

              {/*
                docs/MODERATION.md §5: every public comment carries a report
                action. It sits in the byline rather than under the text, so it
                is reachable without being the thing the eye lands on.
              */}
              <div className="ml-auto">
                <ReportDialog
                  targetType="COMMENT"
                  targetId={comment.id}
                  label={`the comment by ${comment.authorUsername ?? "a deleted account"}`}
                  action={reportAction}
                  turnstileSiteKey={turnstileSiteKey}
                />
              </div>
            </div>

            <CommentBody body={comment.body} />
          </li>
        );
      })}
    </ul>
  );
}
