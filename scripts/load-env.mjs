// scripts/load-env.mjs
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

/**
 * Loads the local environment files for build-time tooling.
 *
 * Next.js loads `.env.local` for the application, but drizzle-kit and Vitest do
 * not — so a developer with a perfectly good `DATABASE_URL` still saw every
 * integration test skip, and `pnpm test:integration` exited 0 having verified
 * nothing. That is the failure mode docs/AI-VERIFICATION.md §8 exists to stop.
 *
 * `node:util.parseEnv` is used rather than a dependency. It also strips the
 * carriage return from a CRLF file, which matters on Windows: sourcing such a
 * file in a shell yields values with a trailing `\r` that the Neon driver
 * rejects with an error that names neither the file nor the cause.
 *
 * Never used from `src/` — the application reads `process.env` directly, and
 * deployed environments supply values through the platform, never a file.
 */

/** Later files do not override earlier ones, matching Next.js's precedence. */
const LOCAL_ENV_FILES = [".env.local", ".env"];

/** Parsed contents of the local env files. Does not touch `process.env`. */
export function readLocalEnv(cwd = process.cwd()) {
  const loaded = {};

  for (const file of LOCAL_ENV_FILES) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;

    for (const [key, value] of Object.entries(
      parseEnv(readFileSync(path, "utf8"))
    )) {
      loaded[key] ??= value;
    }
  }

  return loaded;
}

/**
 * Merges the local env files into `process.env`.
 *
 * A variable already present wins, so an explicit shell export and CI both stay
 * authoritative and a stale local file can never quietly redirect a CI run at a
 * developer's database.
 */
export function applyLocalEnv(cwd = process.cwd()) {
  const loaded = readLocalEnv(cwd);

  for (const [key, value] of Object.entries(loaded)) {
    process.env[key] ??= value;
  }

  return loaded;
}
