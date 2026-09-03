"use client";

import { useActionState } from "react";

import type { AuthActionState } from "@/lib/auth/action-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const initialState: AuthActionState | null = null;

type AuthAction = (state: AuthActionState | null, formData: FormData) => Promise<AuthActionState>;

export function SignInForm({
  requestAction: requestCode,
  verifyAction: verifyCode,
  next,
}: {
  requestAction: AuthAction;
  verifyAction: AuthAction;
  /** Validated same-origin path to return to after verification, if any. */
  next?: string | null;
}) {
  const [requestState, requestFormAction, requestPending] = useActionState(
    requestCode,
    initialState
  );
  const [verifyState, verifyFormAction, verifyPending] = useActionState(
    verifyCode,
    initialState
  );
  const email = requestState?.email ?? "";

  if (requestState?.ok && email) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <AlertTitle>Check your email</AlertTitle>
          <AlertDescription>{requestState.message}</AlertDescription>
        </Alert>
        <form action={verifyFormAction} className="flex flex-col gap-4">
          <input type="hidden" name="email" value={email} />
          {/*
            Only on the verify form: that is the submission that redirects.
            The action re-validates it, so this field being client-editable
            changes nothing that matters.
          */}
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">One-time code</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              className="h-11 tracking-[0.35em]"
              aria-describedby={verifyState ? "code-message" : undefined}
            />
          </div>
          {verifyState && !verifyState.ok ? (
            <p id="code-message" className="text-sm text-destructive" role="alert">
              {verifyState.message}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="h-11" disabled={verifyPending}>
            {verifyPending ? "Checking…" : "Sign in"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={requestFormAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email address</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
        </div>
        {requestState && !requestState.ok ? (
          <p className="text-sm text-destructive" role="alert">{requestState.message}</p>
        ) : null}
        <Button type="submit" size="lg" className="h-11 w-full" disabled={requestPending}>
          {requestPending ? "Sending…" : "Email me a sign-in code"}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      <Button asChild type="button" variant="outline" size="lg" className="h-11 w-full">
        <a href="/api/auth/github">Continue with GitHub</a>
      </Button>
    </div>
  );
}
