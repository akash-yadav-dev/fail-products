// src/lib/config/turnstile.ts
/**
 * Turnstile configuration (`docs/SECURITY.md` §11, ADR-017 slice 3.5).
 *
 * The widget is rendered, and its token demanded, **only when both keys are
 * configured**. That is a deliberate three-way behaviour rather than two:
 *
 * - configured → the control is on, and a missing or invalid token is refused;
 * - not configured, not production → the control is off, so a clean checkout,
 *   the test suite, and CI all work without a Cloudflare account;
 * - not configured, **deployed** → a hard failure. A deployed site that
 *   silently drops a bot control because somebody forgot a secret is the
 *   silent failure `docs/ENGINEERING.md` §1.9 forbids, and it is exactly the
 *   kind that goes unnoticed until the spam arrives.
 *
 * "Deployed" is `NODE_ENV=production` **and** a site URL that is not
 * localhost — the same pair `e2eAuthBypassEnabled()` uses, and for the same
 * reason: `next start` against a local build is production mode without being
 * a deployment, and treating the two alike would make the E2E suite require a
 * Cloudflare account.
 *
 * The site key is public by design — it is rendered into the page — but it is
 * not a `NEXT_PUBLIC_` variable, so the server passes it down as a prop rather
 * than the bundle embedding it. That keeps one place where the pair is read and
 * one place where "is this on?" is decided.
 */

export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY || null;
}

function turnstileSecret(): string | null {
  return process.env.TURNSTILE_SECRET_KEY || null;
}

/** Whether this process is serving a real deployment rather than a local build. */
function isDeployed(): boolean {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    process.env.NODE_ENV === "production" &&
    !siteUrl.startsWith("http://localhost:") &&
    !siteUrl.startsWith("http://127.0.0.1:")
  );
}

/** Whether a submission must carry a verified token. */
export function turnstileEnabled(): boolean {
  const configured = Boolean(turnstileSiteKey() && turnstileSecret());

  if (!configured && isDeployed()) {
    throw new Error(
      "TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are required in a deployment. See .env.example."
    );
  }

  return configured;
}

/** The secret, once `turnstileEnabled()` has said there is one. */
export function requireTurnstileSecret(): string {
  const secret = turnstileSecret();
  if (!secret) {
    throw new Error("TURNSTILE_SECRET_KEY is not set. See .env.example.");
  }
  return secret;
}
