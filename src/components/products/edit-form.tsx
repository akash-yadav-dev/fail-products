"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormActionState } from "@/lib/forms/action-state";

type SaveAction = (
  state: FormActionState | null,
  formData: FormData
) => Promise<FormActionState>;

/**
 * Edits a listing's own fields — the "correct your own record" control
 * `docs/MODERATION.md` §7 requires.
 *
 * Fields are uncontrolled (`defaultValue`) because the rest of the form is not
 * reactive: nothing here depends on another field's value, so a keystroke
 * should not re-render the tree.
 *
 * The category is deliberately absent. The service does not change it, and a
 * fixed taxonomy resolved at submit time is ADR-026's design rather than an
 * omission — so it is shown, read-only, where a founder can at least see where
 * the listing is filed.
 */
export function EditProductForm({
  product,
  action,
}: {
  product: {
    id: string;
    name: string;
    tagline: string | null;
    websiteUrl: string | null;
    description: string | null;
  };
  action: SaveAction;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="productId" value={product.id} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Product name</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={120}
          defaultValue={product.name}
          className="h-11"
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tagline">Tagline</Label>
        <Input
          id="tagline"
          name="tagline"
          maxLength={200}
          defaultValue={product.tagline ?? ""}
          placeholder="One line on what it did."
          className="h-11"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="websiteUrl">Website</Label>
        <Input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          inputMode="url"
          defaultValue={product.websiteUrl ?? ""}
          placeholder="https://example.com"
          className="h-11"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">What happened</Label>
        <Textarea
          id="description"
          name="description"
          rows={8}
          defaultValue={product.description ?? ""}
          placeholder="What you set out to build, what went wrong, and what you would do differently."
        />
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
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
