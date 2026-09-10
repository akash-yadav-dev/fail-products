"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FormActionState } from "@/lib/forms/action-state";

type UnsubscribeAction = (
  state: FormActionState | null,
  formData: FormData
) => Promise<FormActionState>;

/**
 * The one control on the removal page.
 *
 * A client island only because the outcome has to be shown in place — a
 * redirect would put the token back in a URL, and re-rendering the button after
 * a successful removal would invite a second press that can only fail.
 */
export function UnsubscribeForm({
  token,
  action,
}: {
  /** Empty when the link carried no token. The action treats that as a no-op. */
  token: string;
  action: UnsubscribeAction;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  if (state?.ok) {
    return (
      <Alert>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div>
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? "Removing…" : "Remove my email"}
        </Button>
      </div>
    </form>
  );
}
