// tests/e2e/products.spec.ts
import { expect, test } from "@playwright/test";

import {
  removeSeededProduct,
  seedProductWithRetiredSlug,
  seedPublishedProduct,
  type SeededProduct,
} from "./fixtures/seed-product";

/**
 * The public directory, end to end.
 *
 * `/products/[slug]` used to resolve for any value and render a labelled
 * layout preview. It now looks a product up, so the three outcomes ADR-019
 * distinguishes — found, moved, missing — are all browser-visible behaviour and
 * all asserted here.
 *
 * These need a database. Without one they skip rather than assert against a
 * 500: a skipped test is honest, a green one that proved nothing is not
 * (docs/AI-VERIFICATION.md §8).
 */
const noDatabase = !process.env.DATABASE_URL;

test.describe("the public directory", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — every page here is a lookup");

  let seeded: SeededProduct;

  test.beforeAll(async () => {
    if (noDatabase) return;
    seeded = await seedPublishedProduct();
  });

  test.afterAll(async () => {
    if (noDatabase || !seeded) return;
    await removeSeededProduct(seeded);
  });

  test("opens a product from the list and comes back by the breadcrumb", async ({
    page,
  }) => {
    // The flow the plan names, run at both 360 and 1280 by the two projects in
    // playwright.config.ts. A listing that only works on a desktop is broken
    // for most visitors (docs/DESIGN.md §9).
    await page.goto("/products");

    const card = page.getByRole("link", { name: seeded.name });
    await expect(card).toBeVisible();
    await card.click();

    await expect(page).toHaveURL(`/products/${seeded.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(seeded.name);

    await page.getByRole("link", { name: "Products", exact: true }).first().click();
    await expect(page).toHaveURL("/products");
  });

  test("labels the founder's status as a creator claim", async ({ page }) => {
    // docs/LEGAL.md §3: an assertion rendered without its source tier is a
    // defect, and the status is the founder's own classification.
    await page.goto(`/products/${seeded.slug}`);

    await expect(page.getByText("Claimed by creator").first()).toBeVisible();
  });

  test("sends the outbound link with attribution and without passing on rank", async ({
    page,
  }) => {
    await page.goto(`/products/${seeded.slug}`);

    const outbound = page
      .locator('a[href^="https://example.com"]')
      .first();
    const href = await outbound.getAttribute("href");

    // docs/PRODUCT.md §5.1 requires the platform's attribution parameters.
    const url = new URL(href!);
    expect(url.searchParams.get("utm_source")).toBe("failproducts");
    expect(url.searchParams.get("utm_medium")).toBe("referral");
    expect(url.searchParams.get("utm_campaign")).toBe("product-page");

    const rel = await outbound.getAttribute("rel");
    expect(rel).toContain("noopener");
    expect(rel).toContain("nofollow");
  });

  test("404s a slug nobody holds", async ({ page }) => {
    const response = await page.goto(`/products/not-a-real-product-${Date.now()}`);

    expect(response?.status()).toBe(404);
  });

  test("does not invite indexing of a product that is not there", async ({
    page,
  }) => {
    await page.goto(`/products/not-a-real-product-${Date.now()}`);

    // Next emits its own noindex for a 404 and generateMetadata emits one too,
    // so there are two tags. Asserting on "the" tag would pass or fail on which
    // one the locator happened to pick; what matters is that none of them
    // invites indexing.
    const contents = await page
      .locator('meta[name="robots"]')
      .evaluateAll((tags) => tags.map((tag) => tag.getAttribute("content") ?? ""));

    expect(contents.length).toBeGreaterThan(0);
    for (const content of contents) {
      expect(content).toContain("noindex");
    }
  });

  test("permanently redirects a retired slug to the current one", async ({
    page,
    request,
  }) => {
    // ADR-019: a rename must not discard the inbound links the old URL earned.
    // The redirect is the whole reason product_slug_history exists.
    //
    // This seeds its own product rather than renaming the shared one. The suite
    // runs fully parallel across two viewport projects, and a test that mutates
    // a fixture the others read is a race, not a test.
    //
    // The fixture renames it **before** it is ever published, which closes a
    // second race that only appeared once the suite grew: Next prefetches the
    // links it can see, so a concurrent visitor to /products warms the ISR
    // cache for a published product's card, and a slug retired afterwards
    // keeps serving that cached 200 for the length of the revalidate window
    // instead of redirecting.
    const renameable = await seedProductWithRetiredSlug();
    const renamed = { oldSlug: renameable.oldSlug, newSlug: renameable.slug };

    try {
      expect(renamed.newSlug).not.toBe(renamed.oldSlug);

      // The status itself, not just where the browser ended up. A temporary
      // redirect would leave the old URL indexed and the ranking split across
      // two addresses, which is the exact loss ADR-019 exists to prevent.
      //
      // 308, not 301. The plan says "301s to canonical" and Next's
      // `permanentRedirect()` emits 308 — verified here, not assumed. Both are
      // permanent; 308 additionally preserves the request method. The number is
      // pinned rather than accepted as "either" so a future framework change
      // that quietly downgrades it to a 307 fails this test.
      const redirect = await request.get(`/products/${renamed.oldSlug}`, {
        maxRedirects: 0,
      });
      expect(redirect.status()).toBe(308);
      expect(redirect.headers()["location"]).toContain(
        `/products/${renamed.newSlug}`
      );

      const response = await page.goto(`/products/${renamed.oldSlug}`);

      expect(page.url()).toContain(`/products/${renamed.newSlug}`);
      expect(response?.status()).toBe(200);
    } finally {
      await removeSeededProduct(renameable);
    }
  });

  test("searches, then clears back to the full list", async ({ page }) => {
    await page.goto("/products");

    const search = page.getByRole("searchbox", { name: "Search products" });
    // A distinctive word from the seeded listing's tagline, so the match comes
    // from full-text search rather than from the product happening to be first.
    await search.fill("runway");

    // Debounced, so the navigation is not immediate. Waiting on the URL rather
    // than on a timeout is what keeps this from being flaky on a slow machine.
    await page.waitForURL(/\?q=runway/);
    await expect(page.getByRole("link", { name: seeded.name })).toBeVisible();
    await expect(page.getByText(/best matches first/i)).toBeVisible();

    await page.getByRole("link", { name: "Clear" }).click();
    await expect(page).toHaveURL("/products");
    await expect(page.getByRole("link", { name: seeded.name })).toBeVisible();
  });

  test("says nothing matched rather than that the directory is empty", async ({
    page,
  }) => {
    // Showing "no products listed yet" to someone who mistyped a word is how a
    // directory with listings in it comes to look abandoned.
    await page.goto("/products?q=zzzzqqqqnothingmatchesthis");

    await expect(page.getByText(/Nothing matches/i)).toBeVisible();
    await expect(page.getByText(/No products listed yet/i)).toHaveCount(0);
  });

  test("survives a query that would break a naive tsquery", async ({ page }) => {
    // to_tsquery would raise on this; websearch_to_tsquery does not. A 500 that
    // anyone can trigger by typing is not an edge case.
    const response = await page.goto("/products?q=" + encodeURIComponent("a & & b"));

    expect(response?.status()).toBe(200);
  });

  test("indexes a product page that now carries real content", async ({
    page,
  }) => {
    await page.goto(`/products/${seeded.slug}`);

    // The noindex was correct while the page rendered a skeleton. It is wrong
    // now, and leaving it would keep every listing out of search results.
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });
});
