// tests/e2e/referral.spec.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { count, eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import * as schema from "@/db/schema";
import { referralEvents } from "@/db/schema";
import {
  removeSeededProduct,
  seedPublishedProduct,
  type SeededProduct,
} from "./fixtures/seed-product";

/**
 * The outbound hop (ADR-018, slice 4.3).
 *
 * The plan's E2E is "click an outbound link, confirm an event is recorded and
 * the redirect lands". Both halves matter and neither implies the other: a
 * redirect that works while recording nothing is the failure this slice exists
 * to prevent, and it looks perfect from the browser.
 */

const noDatabase = !process.env.DATABASE_URL;

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

async function clickCount(productId: string): Promise<number> {
  const [row] = await db()
    .select({ total: count() })
    .from(referralEvents)
    .where(eq(referralEvents.productId, productId));

  return row?.total ?? 0;
}

test.describe("outbound referral", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — the hop is a query");

  let seeded: SeededProduct;

  test.beforeAll(async () => {
    if (noDatabase) return;
    seeded = await seedPublishedProduct();
  });

  test.afterAll(async () => {
    if (noDatabase) return;
    if (seeded) await removeSeededProduct(seeded);
  });

  test("sends the visit link through the hop, not straight out", async ({
    page,
  }) => {
    await page.goto(`/products/${seeded.slug}`);

    const visit = page.getByRole("link", { name: /^Visit / });
    await expect(visit).toHaveAttribute("href", `/go/${seeded.slug}`);
  });

  test("still shows the reader where they are going", async ({ page }) => {
    // The href is ours; the visible text must stay the destination host. A hop
    // that hides the destination is the shape of a phishing redirect, and this
    // site's subject matter is other people's businesses.
    await page.goto(`/products/${seeded.slug}`);

    const visit = page.getByRole("link", { name: /^Visit / });
    await expect(visit).toContainText("example.com");
  });

  test("records the click and redirects to the attributed URL", async ({
    request,
  }) => {
    const before = await clickCount(seeded.id);

    // Not followed: the destination is example.com and does not resolve. The
    // response itself is what is under test.
    const response = await request.get(`/go/${seeded.slug}`, {
      maxRedirects: 0,
    });

    // Temporary, whichever code the framework picks for it. What matters is
    // that it is not permanent: a 301 is precisely the thing a browser is
    // entitled to remember and stop asking about, which would silently end the
    // counting this route exists for.
    expect([302, 303, 307]).toContain(response.status());

    const location = response.headers()["location"];
    expect(location).toContain("example.com");
    expect(location).toContain("utm_source=failproducts");
    expect(location).toContain("utm_medium=referral");
    expect(location).toContain("utm_campaign=product-page");

    expect(await clickCount(seeded.id)).toBe(before + 1);
  });

  test("counts each click, rather than only the first", async ({ request }) => {
    const before = await clickCount(seeded.id);

    await request.get(`/go/${seeded.slug}`, { maxRedirects: 0 });
    await request.get(`/go/${seeded.slug}`, { maxRedirects: 0 });

    expect(await clickCount(seeded.id)).toBe(before + 2);
  });

  test("is never cached, at any layer", async ({ request }) => {
    // A cached redirect is a click nobody counted, pointing at a destination
    // frozen at whatever it was when the cache filled.
    const response = await request.get(`/go/${seeded.slug}`, {
      maxRedirects: 0,
    });

    const cacheControl = response.headers()["cache-control"] ?? "";
    expect(cacheControl).toMatch(/no-store|no-cache|private/);
  });

  test("404s for a slug that is not a public listing", async ({ request }) => {
    const response = await request.get("/go/no-such-listing-anywhere", {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(404);
  });

  test("keeps crawlers off the hop", async ({ request }) => {
    // Every crawler follow would be counted as a click a person did not make,
    // which is the one number this project promises is honest.
    const response = await request.get("/robots.txt");

    expect(await response.text()).toContain("/go/");
  });
});
