// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

import { applyLocalEnv } from "./scripts/load-env.mjs";

/**
 * drizzle-kit is a build-time CLI, never imported from `src/`. It reads
 * DATABASE_URL from the environment; no value is ever committed.
 *
 *   pnpm db:generate   write a migration from the schema diff
 *   pnpm db:migrate    apply pending migrations
 *   pnpm db:studio     browse the database
 *
 * One migration per logical change, and an applied migration is never edited
 * (docs/ENGINEERING.md §5).
 */
applyLocalEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // Names in the migration files instead of hashes, so a diff is readable.
  verbose: true,
  strict: true,
});
