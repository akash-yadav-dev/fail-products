// src/app/api/health/route.ts
/**
 * Liveness probe for deploy verification and incident response
 * (docs/DEPLOYMENT.md #12).
 *
 * Deliberately shallow: it reports that the Worker is serving requests and
 * nothing else. It must never touch the database, so it cannot be the thing
 * that exhausts the Neon egress budget, and it must never leak configuration.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", time: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } }
  );
}
