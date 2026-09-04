"use client";

import { useEffect, useRef } from "react";

import { TURNSTILE_FIELD } from "@/domain/shared/turnstile-field";

/**
 * The Turnstile challenge, rendered explicitly.
 *
 * **Explicit rather than implicit, and that is the whole point of this file.**
 * Implicit rendering scans the DOM for `.cf-turnstile` elements once, when
 * `api.js` loads. A widget inside a dialog does not exist at that moment — the
 * dialog mounts its content on open — and `next/script` will not re-execute a
 * `src` it has already loaded, which the comment composer on the same page has
 * usually loaded first. The result is a challenge that never renders, no token
 * in the form, and a report that fails every time with a message telling the
 * reporter to reload the page and lose what they wrote. That failure only
 * appears where Turnstile is configured, which is nowhere this project has ever
 * run, so nothing would have caught it before a deploy.
 *
 * Explicit rendering removes the timing entirely: the script is loaded once per
 * page by a module-scoped promise, and each widget calls `turnstile.render()`
 * against its own element on mount, whenever that happens to be.
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

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileRenderOptions = {
  sitekey: string;
  action?: string;
  theme?: "auto" | "light" | "dark";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  /**
   * Turnstile injects its own hidden input into the containing form by
   * default. We turn that off and render the field ourselves, so exactly one
   * field named `cf-turnstile-response` is posted and its lifetime is visible
   * in this file rather than inferred from the script's behaviour.
   */
  "response-field"?: boolean;
};

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: TurnstileRenderOptions
  ) => string | undefined;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

/** Loads `api.js` at most once per page, whoever asks first. */
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      // Let a later mount retry rather than caching the failure for the life
      // of the page — a dropped script on a flaky connection should not
      // permanently disable every form on the page.
      scriptPromise = null;
      reject(new Error("Turnstile script failed to load"));
    });
    document.head.append(script);
  });

  return scriptPromise;
}

export function TurnstileWidget({
  siteKey,
  action,
  resetSignal,
}: {
  /** Null when Turnstile is not configured. */
  siteKey: string | null;
  /**
   * Pinned into the token and re-checked server-side, so a token minted by the
   * comment widget cannot be replayed against the report form.
   */
  action: string;
  /**
   * Change this to discard a spent challenge and issue a fresh one. A token is
   * single-use: without a reset, a second submit after a failed one posts a
   * token Cloudflare has already seen and fails again for a reason that has
   * nothing to do with what the person did.
   */
  resetSignal?: unknown;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;

        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          // Follows the page rather than fighting it. The alternative is a
          // white box in a dark theme, which reads as a broken embed.
          theme: "auto",
          "response-field": false,
          callback: (token) => {
            if (tokenRef.current) tokenRef.current.value = token;
          },
          "expired-callback": () => {
            if (tokenRef.current) tokenRef.current.value = "";
          },
          "error-callback": () => {
            if (tokenRef.current) tokenRef.current.value = "";
          },
        });

        widgetIdRef.current = id ?? null;
      })
      .catch(() => {
        // Nothing to show. The action refuses a submission with no token, so a
        // failed challenge is answered by the server with a message rather
        // than by this component with a broken-looking empty box.
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, action]);

  useEffect(() => {
    // Skips the first run: there is nothing to reset before a widget exists,
    // and resetting a fresh challenge would throw away a valid token.
    if (resetSignal === undefined || resetSignal === null) return;
    if (!widgetIdRef.current || !window.turnstile) return;

    window.turnstile.reset(widgetIdRef.current);
    if (tokenRef.current) tokenRef.current.value = "";
  }, [resetSignal]);

  if (!siteKey) return null;

  return (
    <div>
      <input ref={tokenRef} type="hidden" name={TURNSTILE_FIELD} />
      <div ref={containerRef} />
    </div>
  );
}
