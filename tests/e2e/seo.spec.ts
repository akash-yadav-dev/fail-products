// tests/e2e/seo.spec.ts
import { expect, test } from "@playwright/test";

import {
  removeSeededProduct,
  seedPublishedProduct,
  type SeededProduct,
} from "./fixtures/seed-product";

/**
 * Sitemap, robots, canonicals, and share cards.
 *
 * `docs/PRODUCT.md` §9 is the specification: only useful, unique pages are
 * indexed, and every public product page carries a unique title, a description,
 * a canonical URL, and an Open Graph image.
 *
 * The canonical assertions check the *path*, not the origin. The origin comes
 * from NEXT_PUBLIC_SITE_URL, which playwright.config.ts sets to the local test
 * server — asserting on failproducts.com here would test the config file rather
 * than the application.
 */
const noDatabase = !process.env.DATABASE_URL;

test.describe("robots.txt", () => {
  test("points at the sitemap and keeps crawlers out of private routes", async ({
    request,
  }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain("Sitemap:");
    expect(body).toContain("/sitemap.xml");
    expect(body).toContain("Disallow: /dashboard/");
    expect(body).toContain("Disallow: /api/");
  });
});

test.describe("the sitemap", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — the sitemap reads products");

  let seeded: SeededProduct;

  test.beforeAll(async () => {
    if (noDatabase) return;
    seeded = await seedPublishedProduct();
  });

  test.afterAll(async () => {
    if (noDatabase || !seeded) return;
    await removeSeededProduct(seeded);
  });

  test("is valid XML and lists the closed taxonomies", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain("<urlset");
    expect(body).toContain("/products");
    expect(body).toContain("/categories/ai");
    expect(body).toContain("/status/abandoned");
  });

  test("lists no parameterized duplicate of a page it already has", async ({
    request,
  }) => {
    // docs/PRODUCT.md §9: no thin parameterized pages. ?sort= and ?q= render
    // the same listings in a different order, so each is a duplicate.
    const body = await (await request.get("/sitemap.xml")).text();

    expect(body).not.toContain("?sort=");
    expect(body).not.toContain("?cursor=");
    expect(body).not.toContain("?q=");
  });

  test("lists no page that refuses to be indexed", async ({ request }) => {
    // The legal pages are placeholders carrying no policy text and are noindex
    // until docs/LEGAL.md §4 is satisfied. Listing them would ask for exactly
    // the indexing their own metadata refuses.
    const body = await (await request.get("/sitemap.xml")).text();

    expect(body).not.toContain("/terms");
    expect(body).not.toContain("/privacy");
    expect(body).not.toContain("/takedown");
    expect(body).not.toContain("/dashboard");
  });
});

test.describe("a product page's metadata", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — the product page is a lookup");

  let seeded: SeededProduct;

  test.beforeAll(async () => {
    if (noDatabase) return;
    seeded = await seedPublishedProduct();
  });

  test.afterAll(async () => {
    if (noDatabase || !seeded) return;
    await removeSeededProduct(seeded);
  });

  test("carries a unique title, description, canonical, and OG image", async ({
    page,
  }) => {
    await page.goto(`/products/${seeded.slug}`);

    await expect(page).toHaveTitle(new RegExp(seeded.name));

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`/products/${seeded.slug}$`)
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /.+/
    );
    await expect(
      page.locator('meta[property="og:image"]').first()
    ).toHaveAttribute("content", /opengraph-image/);
  });

  test("serves a real image for the share card", async ({ request, page }) => {
    await page.goto(`/products/${seeded.slug}`);
    const src = await page
      .locator('meta[property="og:image"]')
      .first()
      .getAttribute("content");

    const response = await request.get(src!);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  });

  test("marks up the breadcrumb and nothing it cannot stand behind", async ({
    page,
  }) => {
    await page.goto(`/products/${seeded.slug}`);

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();

    expect(blocks.length).toBeGreaterThan(0);
    const combined = blocks.join(" ");
    expect(combined).toContain("BreadcrumbList");

    // The plan: structured data only where it is honest. A Review or an
    // AggregateRating would publish community opinion to search engines as a
    // rating of a named real business (docs/LEGAL.md §3), and offers on a
    // shut-down product would be a fabrication.
    expect(combined).not.toContain('"Review"');
    expect(combined).not.toContain("AggregateRating");
    expect(combined).not.toContain('"offers"');
  });

  test("is served from the cache rather than the database on every hit", async ({
    request,
  }) => {
    // docs/DEPLOYMENT.md §11 makes this launch-blocking: Neon's free plan
    // allows 5 GB of egress a month, and an uncached product page queries the
    // database for every crawler and every visitor.
    await request.get(`/products/${seeded.slug}`);
    const response = await request.get(`/products/${seeded.slug}`);

    expect(response.headers()["cache-control"]).toContain("s-maxage");
  });
});
