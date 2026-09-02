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

/**
 * ADR-027 — the two landing surfaces take no query string, which is what makes
 * them cacheable at all. `docs/DEPLOYMENT.md` §11 calls the cache hit ratio on
 * `/categories/[slug]` launch-blocking, and awaiting `searchParams` opts a
 * route out of static rendering entirely.
 *
 * These assert the header rather than the ratio. A real ratio needs production
 * traffic; what is verifiable here is that the route is cacheable at all, which
 * is the half that was untrue before.
 */
test.describe("landing pages are cacheable", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — both pages are queries");

  for (const path of ["/categories/ai", "/status/abandoned"]) {
    test(`${path} is served from the cache, not the database`, async ({
      request,
    }) => {
      await request.get(path);
      const response = await request.get(path);

      expect(response.headers()["cache-control"]).toContain("s-maxage");
    });

    test(`${path} ignores a sort parameter rather than rendering dynamically`, async ({
      request,
    }) => {
      // The parameter is not merely unused: reading it would make the route
      // dynamic. If this ever returns a no-store response, the cache is gone.
      const response = await request.get(`${path}?sort=recently-updated`);

      expect(response.headers()["cache-control"]).toContain("s-maxage");
    });
  }

  test("sends deeper browsing to the route that carries parameters", async ({
    page,
  }) => {
    await page.goto("/categories/ai");

    // Only rendered when the category has listings; the link is what replaces
    // the sort control the page used to carry.
    const link = page.getByRole("link", {
      name: /Browse and sort every AI listing/i,
    });

    if ((await link.count()) > 0) {
      await expect(link).toHaveAttribute("href", "/products?category=ai");
    }

    // The sort control belongs to /products now, and must not be in the markup
    // here even hidden — a hidden link is still a link a crawler follows.
    await expect(page.getByRole("navigation", { name: "Sort products" })).toHaveCount(0);
  });
});

test.describe("directory filters", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — the directory is a query");

  test("narrows the directory by category", async ({ page }) => {
    await page.goto("/products?category=saas");

    const filters = page.getByRole("group", { name: "Active filters" });
    await expect(filters).toBeVisible();
    await expect(filters.getByRole("link", { name: "SaaS", exact: true })).toBeVisible();
  });

  test("narrows the directory by status", async ({ page }) => {
    await page.goto("/products?status=abandoned");

    // Scoped to the filter chip: the status badge row on the same page links to
    // /status/abandoned too, and an unscoped locator would match either.
    const filters = page.getByRole("group", { name: "Active filters" });
    await expect(filters).toBeVisible();
    await expect(filters.getByRole("link", { name: "Abandoned", exact: true })).toBeVisible();
  });

  test("offers a way out of a filter it applied", async ({ page }) => {
    await page.goto("/products?category=saas");

    await page
      .getByRole("link", { name: "Remove the SaaS filter" })
      .click();

    await expect(page).toHaveURL("/products");
    await expect(
      page.getByRole("group", { name: "Active filters" })
    ).toHaveCount(0);
  });

  test("ignores a filter nobody defined rather than 404ing a browse page", async ({
    page,
  }) => {
    const response = await page.goto("/products?category=not-a-real-category");

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("group", { name: "Active filters" })
    ).toHaveCount(0);
  });
});
