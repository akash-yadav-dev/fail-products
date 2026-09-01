"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormActionState } from "@/lib/forms/action-state";

type ProfileAction = (
  state: FormActionState | null,
  formData: FormData
) => Promise<FormActionState>;

export type ProfileFormValues = {
  readonly username: string;
  readonly displayName: string;
  readonly bio: string;
  readonly websiteUrl: string;
};

/**
 * The public profile form.
 *
 * `defaultValue` rather than controlled state: the server already knows the
 * current values, and a re-render after a failed save must not discard what the
 * person typed while fixing it.
 */
export function ProfileForm({
  action,
  values,
}: {
  action: ProfileAction;
  values: ProfileFormValues;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={values.displayName}
            autoComplete="name"
            maxLength={80}
            className="h-11"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            defaultValue={values.username}
            autoComplete="username"
            maxLength={39}
            // Mirrors the domain rule so the browser catches the common
            // mistakes first. The server still decides — this is a
            // convenience, never the check.
            pattern="[A-Za-z0-9](?:[A-Za-z0-9]|-(?!-))*[A-Za-z0-9]"
            className="h-11"
            aria-describedby="username-hint"
          />
          <p id="username-hint" className="text-xs text-muted-foreground">
            Your profile lives at /u/{values.username || "your-username"}.
            Letters, numbers, and single hyphens.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="websiteUrl">Website</Label>
        <Input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          inputMode="url"
          defaultValue={values.websiteUrl}
          placeholder="https://example.com"
          className="h-11"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" name="bio" defaultValue={values.bio} rows={4} maxLength={500} />
      </div>

      {state && state.message ? (
        <Alert
          variant={state.ok ? "default" : "destructive"}
          // Announced, because a save result that only appears visually is
          // invisible to anyone using a screen reader.
          role="status"
          aria-live="polite"
        >
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div>
        <Button type="submit" className="h-11" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
