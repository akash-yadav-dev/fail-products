// src/app/api/jobs/referral-maintenance/route.ts
import { notFound } from "next/navigation";

import { constantTimeEqual } from "@/lib/auth/crypto";
import { jobTriggersEnabled, requireJobSecret } from "@/lib/config/jobs";
import { runReferralMaintenance } from "@/services/referral/server-referral";

/**
 * Rolls referral clicks up into the daily table, then prunes what has aged out
 * (ADR-018).
 *
 * A route rather than a CLI script, because the trigger this project has
 * decided on is a Cloudflare Cron Trigger (`docs/ARCHITECTURE.md` §9), and a
 * cron trigger invokes HTTP. The work itself lives in
 * `services/referral/referral-service.ts` and knows nothing about either, so
 * moving to a queue or a worker later changes this file and nothing else.
 *
 * **POST, not GET.** It mutates. A GET would be followed by anything that
 * crawls, prefetches, or previews a link.
 *
 * 404 rather than 401 when the secret is wrong or absent, and 404 when the
 * feature is unconfigured — the same answer either way, so this endpoint cannot
 * be used to discover whether a job system exists (`docs/SECURITY.md` §3).
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!jobTriggersEnabled()) notFound();

  const presented = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${requireJobSecret()}`;

  // Constant time: a byte-by-byte comparison that returns early leaks the
  // secret's prefix to anyone willing to time enough requests.
  if (!constantTimeEqual(presented, expected)) notFound();

  const result = await runReferralMaintenance();

  return Response.json(
    {
      days: result.days.length,
      rolledUp: result.rolledUp,
      pruned: result.pruned,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
