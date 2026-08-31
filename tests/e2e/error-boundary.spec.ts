// tests/e2e/error-boundary.spec.ts
import { expect, test } from "@playwright/test";

/**
 * docs/ENGINEERING.md §11: a failure renders a safe message, never a stack
 * trace. This is the test that proves it, and it needs a real failure to prove
 * it against — src/app/fault/page.tsx exists only for this, and only when
 * E2E_FAULT_ROUTES is set (playwright.config.ts sets it for the E2E server).
 */

/** The message the injected error carries. It must never reach the browser. */
const FAULT_SENTINEL = "FAULT_SENTINEL_9f2c1a";

/** Shapes that only ever appear in a leaked trace or a leaked source path. */
const LEAK_PATTERNS: readonly RegExp[] = [
  /\bat\s+\w[\w$.]*\s+\(/, //      "at Component (…)"
  /webpack-internal:/,
  /node_modules[\/]\.pnpm/,
  /[A-Za-z]:\failproducts/i, //   an absolute path from the build machine
  /\/home\/runner\/work\//, //     an absolute path from CI
  /\.next[\/]server[\/]/,
];

test.describe("the root error boundary", () => {
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL),
    "fault injection is only enabled for the local Playwright build"
  );
  test("renders a safe message instead of the failure", async ({ page }) => {
    const response = await page.goto("/fault");

    // The render failed, and the status says so rather than pretending it did not.
    expect(response?.status()).toBe(500);

    await expect(
      page.getByRole("heading", { name: /something went wrong on our side/i })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("leaks neither the error message nor a stack trace", async ({
    page,
  }) => {
    await page.goto("/fault");

    const html = await page.content();

    expect(html, "the thrown message reached the browser").not.toContain(
      FAULT_SENTINEL
    );

    for (const pattern of LEAK_PATTERNS) {
      expect(html, `leaked ${pattern} into the page`).not.toMatch(pattern);
    }
  });

  test("offers a way back", async ({ page }) => {
    await page.goto("/fault");
    await page.getByRole("link", { name: "Back to home" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
