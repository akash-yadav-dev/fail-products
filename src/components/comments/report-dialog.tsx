"use client";

import Link from "next/link";
import { Flag } from "lucide-react";
import { useActionState, useState, useSyncExternalStore } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import {
  MAX_REPORT_DETAIL_LENGTH,
  REPORT_REASONS,
  type ReportTargetType,
} from "@/domain/moderation/report";
import { ACCOUNT_HINT_COOKIE } from "@/lib/auth/account-hint";
import type { FormActionState } from "@/lib/forms/action-state";

type ReportAction = (
  state: FormActionState | null,
  formData: FormData
) => Promise<FormActionState>;

/**
 * The report action `docs/MODERATION.md` §5 puts on every public product and
 * comment.
 *
 * A dialog rather than an inline form, because the resting state of a product
 * page should be reading. A report form open beside every comment invites
 * reporting as a reflex, and a moderation queue full of reflexes is a queue
 * nobody works.
 *
 * Signed-in only, decided the same way the comment composer decides it — from
 * the hint cookie, because the page around it is prerendered and has no session
 * at render time (ADR-027). The Server Action re-authenticates.
 */
export function ReportDialog({
  targetType,
  targetId,
  label,
  action,
  turnstileSiteKey,
}: {
  targetType: ReportTargetType;
  targetId: string;
  /** What is being reported, for the dialog's own heading. */
  label: string;
  action: ReportAction;
  /** Null when Turnstile is not configured. Resolved server-side. */
  turnstileSiteKey: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");

  const signedIn = useSyncExternalStore(
    subscribeToNothing,
    readAccountHint,
    () => false
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        >
          <Flag aria-hidden="true" className="size-3.5" />
          Report
          <span className="sr-only">{label}</span>
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this {targetType === "PRODUCT" ? "listing" : "comment"}</DialogTitle>
          <DialogDescription>
            Reports go to a moderator. Nothing is removed automatically, and the
            {targetType === "PRODUCT" ? " listing" : " comment"} stays visible
            until somebody has looked at it.
          </DialogDescription>
        </DialogHeader>

        {!signedIn ? (
          <p className="text-sm text-muted-foreground text-pretty">
            Reporting needs an account, so a report can be followed up and a
            pile-on can be spotted.{" "}
            <Link
              href="/auth/sign-in"
              className="rounded-sm font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Sign in
            </Link>
            .
          </p>
        ) : state?.ok ? (
          <Alert>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />

            <div className="flex flex-col gap-2">
              <Label htmlFor={`report-reason-${targetId}`}>What is wrong?</Label>
              <Select name="reason" value={reason} onValueChange={setReason} required>
                <SelectTrigger id={`report-reason-${targetId}`} className="h-11">
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {REPORT_REASONS.find((entry) => entry.value === reason)
                  ?.description ??
                  "Pick the closest match. A moderator reads every report."}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`report-detail-${targetId}`}>
                Anything else{reason === "OTHER" ? "" : " (optional)"}
              </Label>
              <Textarea
                id={`report-detail-${targetId}`}
                name="detail"
                rows={3}
                required={reason === "OTHER"}
                maxLength={MAX_REPORT_DETAIL_LENGTH}
                placeholder="What should the moderator look at?"
                className="text-base"
              />
            </div>

            <TurnstileWidget siteKey={turnstileSiteKey} action="report" />

            {state && !state.ok ? (
              <Alert variant="destructive">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending} className="h-11">
                {pending ? "Sending…" : "Send report"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function subscribeToNothing() {
  return () => {};
}

function readAccountHint(): boolean {
  return document.cookie
    .split("; ")
    .some((entry) => entry.startsWith(ACCOUNT_HINT_COOKIE + "="));
}
