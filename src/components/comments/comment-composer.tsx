"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useState, useSyncExternalStore } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import { MAX_COMMENT_LENGTH } from "@/domain/comment/body";
import { ACCOUNT_HINT_COOKIE } from "@/lib/auth/account-hint";
import type { FormActionState } from "@/lib/forms/action-state";

type PostAction = (
  state: FormActionState | null,
  formData: FormData
) => Promise<FormActionState>;

/**
 * The comment box.
 *
 * A client island on a page that is prerendered and cached (ADR-027). The page
 * has no request and no session at render time, so who is signed in cannot be
 * known there — reading `cookies()` in the page would make the whole route
 * dynamic and undo the launch-blocking cache metric it was just given.
 *
 * So the island asks the browser. `ACCOUNT_HINT_COOKIE` is not HTTP-only and is
 * not a credential: the Server Action re-authenticates against the session
 * cookie on every submission, and forging the hint buys nothing but a form that
 * is then refused. See `src/lib/auth/account-hint.ts`.
 *
 * The signed-out view is what the static HTML contains, which is the right way
 * round: it is the common case on a public directory, so the only people who
 * ever see the swap are the ones already signed in.
 */
export function CommentComposer({
  productId,
  action,
  turnstileSiteKey,
}: {
  productId: string;
  action: PostAction;
  /** Null when Turnstile is not configured. Resolved server-side. */
  turnstileSiteKey: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [length, setLength] = useState(0);

  // Where to come back to after signing in. Sending a reader to /dashboard
  // after they clicked "sign in to comment" on a listing loses both the page
  // and anything they had typed. The action re-validates this with
  // safeNextPath, so an odd pathname is refused there rather than trusted here.
  const pathname = usePathname();
  const returnTo = `/auth/sign-in?next=${encodeURIComponent(`${pathname}#discussion`)}`;

  // `useSyncExternalStore`, not an effect that calls setState. The cookie is an
  // external system this component reads, which is exactly what this hook is
  // for — and the server snapshot is `false`, so the prerendered HTML is the
  // signed-out view and hydration is what upgrades it.
  const signedIn = useSyncExternalStore(
    subscribeToNothing,
    readAccountHint,
    () => false
  );

  if (!signedIn) {
    return (
      <div className="rounded-lg border bg-muted/30 px-4 py-5 text-sm">
        <p className="text-muted-foreground text-pretty">
          Comments are for signed-in accounts.{" "}
          <Link
            href={returnTo}
            className="rounded-sm font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Sign in
          </Link>{" "}
          to say what you saw. Criticise the product; help the builder.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="comment-body">Add a comment</Label>
        <Textarea
          id="comment-body"
          name="body"
          required
          rows={4}
          maxLength={MAX_COMMENT_LENGTH}
          onChange={(event) => setLength(event.target.value.length)}
          placeholder="What did you try, and where did it lose you?"
          // 16px or larger, so iOS does not zoom the viewport on focus. The
          // 360px width docs/DESIGN.md §9 treats as first class is exactly
          // where that zoom makes a form unusable.
          className="min-h-28 text-base"
        />
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {length > 0 ? length + " of " + MAX_COMMENT_LENGTH + " characters. " : null}
          Plain text. Links are shown as their destination.
        </p>
      </div>

      <TurnstileWidget siteKey={turnstileSiteKey} action="comment" />

      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? "Posting…" : "Post comment"}
        </Button>
      </div>
    </form>
  );
}

/**
 * The cookie is read once, at hydration.
 *
 * Nothing here subscribes: the hint changes when this browser signs in or out,
 * and both of those already navigate. Watching for it would mean polling
 * `document.cookie`, which is a timer running on every product page for a case
 * that a page load already covers.
 */
function subscribeToNothing() {
  return () => {};
}

function readAccountHint(): boolean {
  return document.cookie
    .split("; ")
    .some((entry) => entry.startsWith(ACCOUNT_HINT_COOKIE + "="));
}
