// src/services/security/turnstile.ts
import {
  requireTurnstileSecret,
  turnstileEnabled,
} from "@/lib/config/turnstile";
import { verifyTurnstileToken } from "@/integrations/cloudflare/turnstile";

/**
 * The server-side half of Turnstile (`docs/SECURITY.md` §11).
 *
 * A token validated only in the browser is not a control at all — it is a
 * widget an attacker skips by posting the form directly. This is the check that
 * makes it one, and it is called from the action rather than the component so
 * there is no path to a write that bypasses it.
 *
 * The Phase 0 adapter does the siteverify call; this decides *when* it runs and
 * what a failure means.
 */

export type TurnstileOutcome =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Verifies a submitted token, or passes when the control is not configured.
 *
 * `turnstileEnabled()` throws in a deployment with no keys, so "not configured"
 * can only mean local development, a test, or CI — never a live site quietly
 * running without bot protection.
 *
 * The remote IP is read from the request by the caller and passed in, rather
 * than read here from `next/headers`: this module is then plain server code
 * that a test can call, and the Next-specific part stays in the action where
 * every other header read already is. It is used for the verification call and
 * **not stored** — `docs/LEGAL.md` §5 forbids keeping a raw IP without a
 * documented purpose and retention period.
 */
export async function verifyTurnstile(
  token: unknown,
  action: string,
  remoteIp?: string
): Promise<TurnstileOutcome> {
  if (!turnstileEnabled()) return { ok: true };

  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "missing-input-response" };
  }

  return verifyTurnstileToken(token, {
    secret: requireTurnstileSecret(),
    remoteIp,
    // Pinned so a token minted for one widget cannot be replayed against
    // another. Cloudflare returns the action the widget declared.
    expectedAction: action,
  });
}

/**
 * The form field carrying the token, re-exported so an action importing the
 * verifier gets the field name from the same import.
 *
 * Defined in `domain/` because the widget is a client component and cannot
 * import this module — see `src/domain/shared/turnstile-field.ts`.
 */
export { TURNSTILE_FIELD } from "@/domain/shared/turnstile-field";
