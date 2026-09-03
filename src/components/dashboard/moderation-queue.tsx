"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { findReportReason, type ReportReason } from "@/domain/moderation/report";
import type { FormActionState } from "@/lib/forms/action-state";

type Action = (
  state: FormActionState | null,
  formData: FormData
) => Promise<FormActionState>;

export type QueueEntry = {
  id: string;
  targetType: "PRODUCT" | "COMMENT";
  reason: string;
  detail: string | null;
  createdAt: Date;
  reporterUsername: string | null;
  productId: string | null;
  commentId: string | null;
  productSlug: string | null;
  productName: string | null;
  productModerationState: string | null;
  commentBody: string | null;
  commentModerationState: string | null;
};

/**
 * The report queue.
 *
 * Every row carries the whole decision: what was reported, who reported it,
 * what state the content is in now, and the three things a moderator can do
 * about it. A queue that requires a second page to act on an entry is a queue
 * where the second page does not get opened.
 *
 * The reason field is **required** on every action, and that is the point:
 * `docs/MODERATION.md` §10 promises an appeal path, and an appeal is heard
 * against a recorded reason. A form that lets the reason be skipped produces
 * an audit trail that says a moderator did something, and nothing about why.
 */
export function ModerationQueue({
  entries,
  moderateCommentAction,
  moderateProductAction,
  resolveReportAction,
}: {
  entries: readonly QueueEntry[];
  moderateCommentAction: Action;
  moderateProductAction: Action;
  resolveReportAction: Action;
}) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nothing waiting</CardTitle>
          <CardDescription>
            No open reports. The queue fills from the report action on every
            public listing and comment.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {entries.map((entry) => (
        <li key={entry.id}>
          <QueueRow
            entry={entry}
            moderateCommentAction={moderateCommentAction}
            moderateProductAction={moderateProductAction}
            resolveReportAction={resolveReportAction}
          />
        </li>
      ))}
    </ul>
  );
}

function QueueRow({
  entry,
  moderateCommentAction,
  moderateProductAction,
  resolveReportAction,
}: {
  entry: QueueEntry;
  moderateCommentAction: Action;
  moderateProductAction: Action;
  resolveReportAction: Action;
}) {
  const [state, formAction, pending] = useActionState(
    entry.targetType === "COMMENT" ? moderateCommentAction : moderateProductAction,
    null
  );
  const [dismissState, dismissAction, dismissPending] = useActionState(
    resolveReportAction,
    null
  );

  const reason = findReportReason(entry.reason as ReportReason);
  const currentState =
    entry.targetType === "COMMENT"
      ? entry.commentModerationState
      : entry.productModerationState;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="destructive">{reason.label}</Badge>
          <Badge variant="outline">
            {entry.targetType === "COMMENT" ? "Comment" : "Listing"}
          </Badge>
          {currentState && currentState !== "VISIBLE" && currentState !== "NONE" ? (
            <Badge variant="secondary">Already {currentState.toLowerCase()}</Badge>
          ) : null}
          <span className="text-sm text-muted-foreground">
            {entry.createdAt.toISOString().slice(0, 10)} · reported by{" "}
            {entry.reporterUsername ? `@${entry.reporterUsername}` : "a deleted account"}
          </span>
        </div>

        <CardTitle className="text-base">
          {entry.productSlug ? (
            <Link
              href={`/products/${entry.productSlug}`}
              className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {entry.productName}
            </Link>
          ) : (
            "Listing removed"
          )}
        </CardTitle>

        {entry.detail ? (
          <CardDescription className="text-pretty wrap-anywhere">
            {/*
              The reporter's own words, rendered as text. It is user input like
              any other, and it reaches a moderator through the same escaping
              every other piece of user content does.
            */}
            &ldquo;{entry.detail}&rdquo;
          </CardDescription>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {entry.targetType === "COMMENT" && entry.commentBody ? (
          // Same reason as the comment body: this is the reported text
          // verbatim, so an unbroken URL would scroll the moderator queue
          // sideways on a phone.
          <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-line text-muted-foreground wrap-anywhere">
            {entry.commentBody}
          </blockquote>
        ) : null}

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="reportId" value={entry.id} />
          {entry.targetType === "COMMENT" ? (
            <input type="hidden" name="commentId" value={entry.commentId ?? ""} />
          ) : (
            <input type="hidden" name="productId" value={entry.productId ?? ""} />
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor={`reason-${entry.id}`}>Reason for the action</Label>
            <Input
              id={`reason-${entry.id}`}
              name="reason"
              required
              maxLength={500}
              className="h-11"
              placeholder="What rule does this break?"
            />
          </div>

          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          {state?.ok ? (
            <Alert>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {entry.targetType === "COMMENT" ? (
              <>
                <Button
                  type="submit"
                  name="to"
                  value="HIDDEN"
                  variant="outline"
                  disabled={pending}
                  className="h-10"
                >
                  Hide comment
                </Button>
                <Button
                  type="submit"
                  name="to"
                  value="REMOVED"
                  variant="destructive"
                  disabled={pending}
                  className="h-10"
                >
                  Remove comment
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="submit"
                  name="to"
                  value="FLAGGED"
                  variant="outline"
                  disabled={pending}
                  className="h-10"
                >
                  Flag listing
                </Button>
                <Button
                  type="submit"
                  name="to"
                  value="HIDDEN"
                  variant="outline"
                  disabled={pending}
                  className="h-10"
                >
                  Hide listing
                </Button>
                <Button
                  type="submit"
                  name="to"
                  value="REMOVED"
                  variant="destructive"
                  disabled={pending}
                  className="h-10"
                >
                  Remove listing
                </Button>
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-pretty">
            {/*
              ADR-013, stated where the decision is made rather than left in a
              document. A moderator moves the moderation axis and nothing else:
              the founder's own status for their product, and their decision to
              publish it, are not this form's to change.
            */}
            This changes the moderation state only. The founder&rsquo;s own
            status for the product and their decision to publish it are
            untouched.
          </p>
        </form>

        <form
          action={dismissAction}
          className="flex flex-col gap-3 border-t pt-4"
        >
          <input type="hidden" name="reportId" value={entry.id} />
          <input type="hidden" name="status" value="DISMISSED" />

          <div className="flex flex-col gap-2">
            <Label htmlFor={`note-${entry.id}`}>
              Or close it without acting
            </Label>
            <Input
              id={`note-${entry.id}`}
              name="note"
              required
              maxLength={500}
              className="h-11"
              placeholder="Why this is not a breach"
            />
          </div>

          {dismissState && !dismissState.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{dismissState.message}</AlertDescription>
            </Alert>
          ) : null}

          <div>
            <Button
              type="submit"
              variant="ghost"
              disabled={dismissPending}
              className="h-10"
            >
              Dismiss report
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
