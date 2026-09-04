// src/lib/config/jobs.ts
/**
 * The shared secret a scheduled job presents to trigger itself.
 *
 * ADR-018 requires the `referral_events` prune and rollup to be *running*, not
 * merely written, and `docs/ARCHITECTURE.md` §9 prefers a Cloudflare Cron
 * Trigger over any new infrastructure. A cron trigger invokes an HTTP endpoint,
 * so the endpoint needs a way to tell the scheduler apart from the internet.
 *
 * The same three-way behaviour as Turnstile (`src/lib/config/turnstile.ts`),
 * for the same reason:
 *
 * - configured -> the job route exists and demands the secret;
 * - not configured, not deployed -> the route 404s, so a clean checkout, the
 *   test suite, and CI need no secret;
 * - not configured, **deployed** -> a hard failure. A deployed site whose
 *   retention job cannot be triggered accumulates raw click rows forever, and
 *   the whole point of ADR-018 is that retention is not something to discover
 *   the need for later.
 */

function jobSecret(): string | null {
  return process.env.JOB_TRIGGER_SECRET || null;
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

/** Whether scheduled job endpoints are reachable at all. */
export function jobTriggersEnabled(): boolean {
  const configured = Boolean(jobSecret());

  if (!configured && isDeployed()) {
    throw new Error(
      "JOB_TRIGGER_SECRET is required in a deployment: ADR-018's prune and rollup cannot run without it. See .env.example."
    );
  }

  return configured;
}

/** The secret, once `jobTriggersEnabled()` has said there is one. */
export function requireJobSecret(): string {
  const secret = jobSecret();
  if (!secret) throw new Error("JOB_TRIGGER_SECRET is not set. See .env.example.");
  return secret;
}
