// src/lib/auth/account-hint.ts
import { authConfig } from "@/lib/config/auth";

/**
 * A cookie that says "this browser has a session", readable by JavaScript.
 *
 * **It is not a credential and it is not an authorization signal.** The session
 * cookie is HTTP-only and stays that way; every Server Action re-authenticates
 * against it. This one exists for a rendering problem the session cookie cannot
 * solve: `/products/[slug]` is prerendered and cached (ADR-027), so it has no
 * request and no session at render time. Reading `cookies()` there would opt the
 * route out of static rendering entirely and undo the one Phase 2 gate item that
 * `docs/DEPLOYMENT.md` §11 calls launch-blocking.
 *
 * So the page ships one HTML for everybody, and the comment composer — a client
 * island — reads this hint to decide whether to show a form or a sign-in
 * prompt. Forging it gains an attacker a form whose submission the server then
 * refuses, which is the same thing they would get by typing the URL.
 *
 * Set wherever a session is created, cleared wherever one is revoked. Losing
 * that pairing is a cosmetic bug, never a security one — which is the property
 * that makes this acceptable at all.
 */
export const ACCOUNT_HINT_COOKIE = "failproducts_account";

export function accountHintCookieOptions() {
  return {
    // Deliberately readable by scripts. That is the entire purpose.
    httpOnly: false,
    secure: authConfig().isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  };
}
