"use client";

import { useActionState, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FAILURE_STATUSES, type FailureStatus } from "@/domain/product/failure-status";
import type { FormActionState } from "@/lib/forms/action-state";

type StatusAction = (
  state: FormActionState | null,
  formData: FormData
) => Promise<FormActionState>;

/**
 * The owner's factual status, as its own control.
 *
 * Separate from the details form because it is a separate axis (ADR-013) — a
 * founder marking a product recovered should not have to re-save their
 * description to do it, and the two are stored and audited independently.
 *
 * Every pair is legal except a no-op (`canTransitionFailureStatus`), so the
 * whole list is offered. The Save button is disabled while the choice is
 * unchanged, which turns that one illegal transition into a control that simply
 * cannot be pressed rather than an error message about a non-change.
 */
export function StatusForm({
  productId,
  current,
  action,
}: {
  productId: string;
  current: FailureStatus;
  action: StatusAction;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [status, setStatus] = useState<string>(current);
  const chosen = FAILURE_STATUSES.find((entry) => entry.value === status);
  const unchanged = status === current;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="productId" value={productId} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="to">What is it doing now?</Label>
        <Select name="to" value={status} onValueChange={setStatus}>
          <SelectTrigger id="to" aria-describedby="to-hint" className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FAILURE_STATUSES.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id="to-hint" className="text-sm text-muted-foreground">
          {chosen ? chosen.description : ""}
        </p>
      </div>

      {state && state.message ? (
        <Alert
          variant={state.ok ? "default" : "destructive"}
          role="status"
          aria-live="polite"
        >
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div>
        <Button
          type="submit"
          className="h-10"
          disabled={pending || unchanged}
        >
          {pending ? "Saving…" : "Update status"}
        </Button>
      </div>
    </form>
  );
}
