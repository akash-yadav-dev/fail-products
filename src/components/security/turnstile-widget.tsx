"use client";

import Script from "next/script";

/**
 * The Turnstile challenge.
 *
 * Cloudflare's implicit rendering: the script finds every `.cf-turnstile`
 * element on the page, runs the challenge, and injects a hidden
 * `cf-turnstile-response` input into the containing form. Nothing here handles
 * the token, which is the point — there is no state to get wrong and no
 * callback to forget to wire up.
 *
 * **The widget is not the control.** It is a convenience that produces a token;
 * `verifyTurnstile` in the action is what makes the token mean anything, and a
 * form posted without ever loading this script is refused there. A token
 * validated only in the browser is not a control at all
 * (`docs/SECURITY.md` §11).
 *
 * Renders nothing when Turnstile is unconfigured, which is every local
 * checkout, the test suite, and CI. The server refuses to treat that as
 * acceptable in a deployment — see `src/lib/config/turnstile.ts`.
 */
export function TurnstileWidget({
  siteKey,
  action,
}: {
  /** Null when Turnstile is not configured. */
  siteKey: string | null;
  /**
   * Pinned into the token and re-checked server-side, so a token minted by the
   * comment widget cannot be replayed against the report form.
   */
  action: string;
}) {
  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
      />
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-action={action}
        // Follows the page rather than fighting it. The alternative is a white
        // box in a dark theme, which reads as a broken embed.
        data-theme="auto"
      />
    </>
  );
}
