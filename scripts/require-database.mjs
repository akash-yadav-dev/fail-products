// scripts/require-database.mjs
import { applyLocalEnv } from "./load-env.mjs";

/**
 * Preflight for `pnpm test:integration`.
 *
 * The integration suites skip themselves when there is no database, which is
 * correct for `pnpm test` — the unit layer must run anywhere, including a clean
 * checkout with no environment at all (tests/02-testing.md).
 *
 * It is not correct for a command whose entire purpose is to run integration
 * tests. That exiting 0 having run nothing reads exactly like a pass, and a
 * green run that verified nothing is worse than a red one.
 *
 * So: `pnpm test` still skips quietly, and asking for integration tests
 * specifically without a database fails loudly and says why.
 */

applyLocalEnv();

if (!process.env.DATABASE_URL) {
  console.error(
    [
      "",
      "  Integration tests need a database and DATABASE_URL is not set.",
      "",
      "  They run against a Neon development branch, never a mock and never",
      "  production (AGENTS.md §8). Set DATABASE_URL in .env.local, apply the",
      "  migrations with `pnpm db:migrate`, then run this again.",
      "",
      "  To run only the layer that needs no database: pnpm test:unit",
      "",
    ].join("\n")
  );
  process.exit(1);
}
