// vitest.config.ts
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { applyLocalEnv } from "./scripts/load-env.mjs";

/**
 * Two projects, because the layers have different requirements.
 *
 * `unit` is pure logic — no database, no network, no React (tests/02-testing.md).
 * It must run anywhere, including a clean checkout with no environment at all.
 *
 * `integration` runs against a Neon development branch (AGENTS.md §8). Without
 * DATABASE_URL there is nothing to run against, so those suites skip themselves
 * loudly rather than passing on a mock — see tests/integration/database.ts.
 *
 *   pnpm test              both projects
 *   pnpm test:unit         the fast loop
 *   pnpm test:integration  fails outright if no database is configured
 */

/**
 * Vitest does not read `.env.local`; Next.js does. That gap meant a developer
 * with a working DATABASE_URL still watched all 25 integration tests skip, and
 * `pnpm test:integration` exit 0 having proven nothing about the schema.
 *
 * Real environment variables still win — see scripts/load-env.mjs.
 */
applyLocalEnv();

/** `@/…` has to resolve here too; projects do not inherit the root resolve config. */
const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          // A database round trip is not a millisecond.
          testTimeout: 30_000,
          // Shared rows across parallel files would make failures unreproducible.
          fileParallelism: false,
        },
      },
    ],
  },
});
