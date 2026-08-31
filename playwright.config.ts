// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against a real production build, never `next dev` — the dev server
 * differs in caching, error output, and bundling, and those are exactly the
 * things these tests assert on.
 *
 * Two viewports, because docs/DESIGN.md treats 360px as a first-class width and
 * the header swaps to a sheet below `md`. A flow that only passes at 1280 is a
 * flow that is broken for most visitors.
 */

/*
 * A dedicated port, not 3000. A `next dev` server left running on the default
 * port would otherwise be reused as if it were the build under test, and the
 * suite would silently assert against whatever that process happened to serve.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/** Set when pointing the suite at a deployed preview instead of a local build. */
const usingExternalTarget = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // A committed `.only` silently shrinks the suite to one test.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html"], ["github"]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-360",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 } },
    },
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: usingExternalTarget
    ? undefined
    : {
        command: `pnpm build && pnpm exec next start --port ${PORT}`,
        url: baseURL,
        // The only environment where src/app/fault/page.tsx exists. It is what
        // gives tests/e2e/error-boundary.spec.ts an error to assert against.
        env: { E2E_FAULT_ROUTES: "1" },
        // A production build is slow on a cold cache; CI is slower still.
        timeout: 300_000,
        // Never inherit a process this config did not start.
        reuseExistingServer: false,
        stdout: "pipe",
        stderr: "pipe",
      },
});
