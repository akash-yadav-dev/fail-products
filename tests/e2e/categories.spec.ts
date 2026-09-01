// tests/e2e/categories.spec.ts
import { expect, test } from "@playwright/test";

/**
 * Category and status pages.
 *
 * Both used to resolve for any value at all. The taxonomy is fixed (ADR-026)
 * and the statuses are a closed domain enum, so both now 404 on an unknown
 * slug rather than rendering an empty page for a search engine to index.
 *
 * These need no seeded product: what is asserted is routing and indexability,
 * which hold on an empty directory. The category page itself is a database
 * read, so it still needs a database.
 */
const noDatabase = !process.env.DATABASE_URL;

test.describe("category pages", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — the category list is a query");

  test("lists the curated categories", async ({ page }) => {
    await page.goto("/categories");

    await expect(
      page.getByRole("heading", { name: "Developer tools" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fintech" })).toBeVisible();
  });

  test("opens a category from the index", async ({ page }) => {
    await page.goto("/categories");
    await page.getByRole("link", { name: /Browse developer tools/i }).click();

    await expect(page).toHaveURL("/categories/developer-tools");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Developer tools"
    );
  });

  test("404s a category nobody defined", async ({ page }) => {
    const response = await page.goto("/categories/not-a-real-category");

    expect(response?.status()).toBe(404);
  });

  test("indexes a category page now that the taxonomy is real", async ({
    page,
  }) => {
    await page.goto("/categories/ai");

    // The noindex was correct while any slug resolved. It is wrong now.
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });

  test("names its own canonical URL", async ({ page }) => {
    await page.goto("/categories/saas");

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/categories\/saas$/
    );
  });
});

test.describe("status pages", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — the status list is a query");

  test("renders a known status with its product list", async ({ page }) => {
    await page.goto("/status/abandoned");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Abandoned");
  });

  test("says the status is the founder's own claim", async ({ page }) => {
    // docs/LEGAL.md §3: "the founder listed this product as abandoned", never
    // "this product failed". A page listing five products by status is exactly
    // where that distinction gets lost.
    await page.goto("/status/abandoned");

    await expect(
      page.getByText(/has not independently verified/i)
    ).toBeVisible();
  });

  test("404s an unknown status", async ({ page }) => {
    const response = await page.goto("/status/not-a-real-status");

    expect(response?.status()).toBe(404);
  });
});
