// tests/integration/database.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "@/db/schema";

/**
 * Integration tests run against a **Neon development branch** (AGENTS.md §8) —
 * never a mock, and never production.
 *
 * When DATABASE_URL is absent there is nothing to test against, so the suites
 * skip themselves. They report as *skipped*, not as passed
 * (docs/AI-VERIFICATION.md §8): a green run with no database has verified
 * nothing about the schema.
 */

export const databaseUrl = process.env.DATABASE_URL;

/** Used as `describe.skipIf(noDatabase)` at the top of every integration suite. */
export const noDatabase = !databaseUrl;

export const SKIP_REASON =
  "DATABASE_URL is not set - integration tests need a Neon development branch";

export function testDb() {
  if (!databaseUrl) {
    throw new Error(SKIP_REASON);
  }

  return drizzle(neon(databaseUrl), { schema });
}

/**
 * A value nothing else will collide with, for rows a test creates and owns.
 * Tests never share fixtures: a shared row makes a failure unreproducible.
 */
export function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
