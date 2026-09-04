"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import { WAITLIST_CONSENT_STATEMENT } from "@/domain/waitlist/signup";
import type { FormActionState } from "@/lib/forms/action-state";

type JoinAction = (
  state: FormActionState | null,
  formData: FormData
) => Promise<FormActionState>;

/**
 * The waitlist join form.
 *
 * Open to signed-out visitors — `docs/PRODUCT.md` §13 lists "join a waitlist"
 * among the things a non-logged-in visitor can do — so unlike the comment
 * composer this reads no account hint and swaps to nothing. The static HTML the
 * prerendered page ships (ADR-027) is the form itself, which is the whole
 * audience.
 *
 * The consent checkbox is `required` in the browser and re-checked on the
 * server, and its label is the exact sentence stored with the entry. That is
 * not duplication for its own sake: `docs/LEGAL.md` §5 makes this data
 * consent-based, and consent is only evidence if the wording shown and the
 * wording recorded are the same string. Importing the constant is what
 * guarantees they cannot drift.
 *
 * `Checkbox` here is a plain `<input type="checkbox">` rather than the Radix
 * primitive: Radix renders a button and a hidden input, and `required` on the
 * hidden one is not enforced by the browser. A native checkbox gets validation,
 * keyboard behaviour, and the label association for free — which is what the
 * 360px keyboard-only requirement in the plan actually needs.
 */
export function WaitlistForm({
  productId,
  productName,
  action,
  turnstileSiteKey,
}: {
  productId: string;
  productName: string;
  action: JoinAction;
  /** Null when Turnstile is not configured. Resolved server-side. */
  turnstileSiteKey: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="productId" value={productId} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="waitlist-email">Email address</Label>
        <Input
          id="waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          maxLength={320}
          placeholder="you@example.com"
          // 16px or larger, so iOS does not zoom the viewport on focus. At the
          // 360px width docs/DESIGN.md §9 treats as first class, that zoom is
          // what makes a form unusable.
          className="text-base"
        />
      </div>

      <div className="flex items-start gap-3">
        <input
          id="waitlist-consent"
          name="consent"
          type="checkbox"
          required
          className="mt-1 size-4 shrink-0 rounded-sm border border-input accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Label
          htmlFor="waitlist-consent"
          className="text-sm leading-snug font-normal text-muted-foreground"
        >
          {WAITLIST_CONSENT_STATEMENT}
        </Label>
      </div>

      <TurnstileWidget siteKey={turnstileSiteKey} action="waitlist" />

      {state ? (
        <Alert variant={state.ok ? "default" : "destructive"}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending} className="h-11">
        {pending ? "Adding you…" : `Join the ${productName} waitlist`}
      </Button>

      <p className="text-xs text-muted-foreground text-pretty">
        FailProducts passes your address to this product&rsquo;s founder and
        sends nothing else. You can remove it from any email we send.
      </p>
    </form>
  );
}

