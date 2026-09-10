"use client";

import { useActionState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FormActionState } from "@/lib/forms/action-state";

type ToggleAction = (
  state: FormActionState | null,
  formData: FormData
) => Promise<FormActionState>;

/**
 * The owner's waitlist controls for one listing.
 *
 * A submit button per state rather than a checkbox that posts on change: an
 * auto-submitting control gives a keyboard user no way to change their mind
 * between focusing it and firing it, and it makes a stray keypress a state
 * change on a public page.
 *
 * The export is a plain link, not a fetch. The response is a file with a
 * `Content-Disposition`, so the browser's own download is exactly the right
 * behaviour and anything else would be reimplementing it — and it means the
 * control works with JavaScript disabled, which for a data-export route is the
 * difference between a founder getting their list and not.
 */
export function WaitlistToggle({
  productId,
  enabled,
  subscriberCount,
  action,
}: {
  productId: string;
  enabled: boolean;
  subscriberCount: number;
  action: ToggleAction;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <div className="flex flex-col items-start gap-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />

        <Button
          type="submit"
          size="sm"
          variant={enabled ? "outline" : "secondary"}
          disabled={pending}
          className="h-9"
        >
          {pending
            ? "Saving…"
            : enabled
              ? "Turn waitlist off"
              : "Turn waitlist on"}
        </Button>

        {enabled ? (
          <Button asChild size="sm" variant="ghost" className="h-9">
            <a href={`/api/products/${productId}/waitlist`} download>
              <Download aria-hidden="true" />
              Export CSV
            </a>
          </Button>
        ) : null}
      </form>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {state
          ? state.message
          : enabled
            ? `${subscriberCount} confirmed ${subscriberCount === 1 ? "subscriber" : "subscribers"}.`
            : "Off. The product page shows no signup form."}
      </p>
    </div>
  );
}
