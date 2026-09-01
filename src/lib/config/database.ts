// src/lib/config/database.ts
/** Server-only database configuration. Values are never sent to the client. */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. See .env.example and docs/DEPLOYMENT.md.");
  }
  return url;
}

/**
 * Whether this process is Next's production build, rather than a running server.
 *
 * Exists for one narrow case: pages that read the database and are prerendered
 * at build time. CI builds the application to verify it compiles and has no
 * database — `.github/workflows/ci.yml` passes no `DATABASE_URL`, deliberately,
 * because a build gate that needs a live database is a build gate contributors
 * cannot run.
 *
 * Verified, not assumed: `next build` sets `NEXT_PHASE=phase-production-build`,
 * checked by printing it during a real build on 2026-09-01.
 */
export function isProductionBuild(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * Whether a prerender may skip its database read instead of failing the build.
 *
 * True **only** when both are true: this is a build, and no database is
 * configured. At runtime a missing `DATABASE_URL` still throws, because a
 * deployed site quietly rendering "no categories" instead of erroring is the
 * silent failure `docs/ENGINEERING.md` §1.9 forbids — and every deployed
 * environment has the variable, so a production build prerenders real data.
 */
export function canSkipDatabaseAtBuild(): boolean {
  return isProductionBuild() && !process.env.DATABASE_URL;
}
