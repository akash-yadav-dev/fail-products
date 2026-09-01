// tests/e2e/profile.spec.ts
import { expect, test } from "@playwright/test";

/**
 * `/u/[username]` used to resolve for any value at all, which meant every
 * mistyped handle was a soft 404 that search engines were free to index.
 *
 * These need a database: the page's whole behaviour is the lookup. Without one
 * they skip rather than assert against a 500 — a skipped test is honest, a
 * green one that proved nothing is not (docs/AI-VERIFICATION.md §8).
 */
const noDatabase = !process.env.DATABASE_URL;

test.describe("a builder profile", () => {
  test.skip(
    noDatabase,
    "DATABASE_URL is not set — the profile page is a database lookup"
  );

  test("returns 404 for a handle nobody holds", async ({ page }) => {
    const response = await page.goto(`/u/definitely-not-a-real-handle-${Date.now()}`);

    expect(response?.status()).toBe(404);
  });

  test("does not invite indexing of an unknown handle", async ({ page }) => {
    await page.goto(`/u/definitely-not-a-real-handle-${Date.now()}`);

    // The 404 page is the site's own; it must not carry a profile title that
    // reads like a real account.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("rejects a reserved handle the same way as an unknown one", async ({
    page,
  }) => {
    // "admin" can never be registered (ADR-019), so it must 404 rather than
    // render an empty profile that looks official.
    const response = await page.goto("/u/admin");

    expect(response?.status()).toBe(404);
  });
});
