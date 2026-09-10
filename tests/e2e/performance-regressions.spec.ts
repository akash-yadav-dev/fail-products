import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { products, reports, sessions } from "@/db/schema";
import { readFileSync, writeFileSync } from "node:fs";
import { PRODUCT_CATEGORIES } from "@/domain/product/category";
import { testDb } from "../integration/database";
import { seedPublishedProduct, removeSeededProduct } from "./fixtures/seed-product";
import { seedSignedInAccount, removeSeededAccount } from "./fixtures/seed-session";

/**
 * Regressions for the 2026-09-09 performance audit.
 *
 * The moderation case reads "related listings", which is the newest three rows
 * in the whole directory rather than a per-product relation. Two viewport
 * projects seeding into one shared database at the same time can therefore push
 * a fixture out of its own peer's related set. CI already runs one worker; a
 * local `pnpm test:e2e` defaults to several, so run this file with
 * `--workers=1` when reproducing it by hand.
 *
 * The query-budget case needs a server started with
 * `--import ./scripts/performance-query-trace.mjs` and the same absolute
 * `PERF_QUERY_TRACE` path in both processes. Without it, it skips rather than
 * reporting an unmeasured pass.
 */

test.describe("directory search navigation", () => {
  test.skip(!process.env.DATABASE_URL, "Requires the isolated development database");

  test("keeps active filters while searching and clearing the query", async ({ page }) => {
    await page.goto("/products?category=developer-tools&status=abandoned");
    const input = page.getByRole("searchbox");
    await input.fill("runway");
    await expect(page).toHaveURL(/q=runway/);
    let url = new URL(page.url());
    expect(url.searchParams.get("category")).toBe("developer-tools");
    expect(url.searchParams.get("status")).toBe("abandoned");
    await expect(input).toBeFocused();
    await input.fill("");
    await expect(page).not.toHaveURL(/q=/);
    url = new URL(page.url());
    expect(url.searchParams.get("category")).toBe("developer-tools");
    expect(url.searchParams.get("status")).toBe("abandoned");
  });

  test("reflects URL query changes without replaying the old textbox value", async ({ page }) => {
    await page.goto("/products?q=before");
    // A completed client search establishes hydration and router readiness.
    await page.getByRole("searchbox").fill("ready");
    await expect(page).toHaveURL(/q=ready/);
    // Next integrates native history updates with router state. Back restores
    // this URL without a document reload or a new searchbox element.
    await page.evaluate(() => history.pushState(null, "", "/products?q=after"));
    await expect(page.getByRole("searchbox")).toHaveValue("after");
    await page.goBack();
    await expect(page.getByRole("searchbox")).toHaveValue("ready");
    await page.goForward();
    await expect(page).toHaveURL(/q=after/);
    await expect(page.getByRole("searchbox")).toHaveValue("after");
  });

  test("preserves filters when the search form submits without JavaScript", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    try {
      const page = await context.newPage();
      await page.goto("/products?category=developer-tools&status=abandoned");
      await page.getByRole("searchbox").fill("runway");
      await page.getByRole("searchbox").press("Enter");
      await expect(page).toHaveURL(/q=runway/);
      const url = new URL(page.url());
      expect(url.searchParams.get("category")).toBe("developer-tools");
      expect(url.searchParams.get("status")).toBe("abandoned");
    } finally { await context.close(); }
  });
});

test("moderation refreshes warm counts, related cards, share images and detail pages", async ({ page, context, baseURL, request }) => {
  test.skip(!process.env.DATABASE_URL, "Requires the isolated development database");
  const product = await seedPublishedProduct();
  const peer = await seedPublishedProduct();
  const moderator = await seedSignedInAccount("MODERATOR");
  const category = PRODUCT_CATEGORIES.find(item => item.slug === "developer-tools")!;
  const db = testDb();
  try {
    await db.update(products).set({ categoryId: category.id }).where(eq(products.id, product.id));
    await db.insert(reports).values({ targetType: "PRODUCT", productId: product.id,
      reporterId: moderator.userId, reason: "SPAM" });
    const hostname = new URL(baseURL!).hostname;
    await context.addCookies(["__Host-failproducts_session", "failproducts_session"].map(name => ({
      name, value: moderator.token, domain: hostname, path: "/", secure: true, httpOnly: true,
      sameSite: "Lax" as const,
    })));
    // First flagging the listing invalidates a category index built before the
    // fixture existed. FLAGGED remains public, and leaves an auditable action.
    await page.goto("/dashboard/moderation");
    let entry = page.locator("li").filter({ hasText: product.name }).first();
    await entry.getByLabel("Reason for the action").fill("Reviewing this fixture listing.");
    await entry.getByRole("button", { name: "Flag listing", exact: true }).click();
    await expect(entry).toHaveCount(0);
    await page.goto("/categories");
    const count = async () => {
      const text = await page.locator("li").filter({ has: page.getByRole("heading", { name: "Developer tools", exact: true }) }).innerText();
      return Number(text.match(/(\d+) listings?/)?.[1] ?? 0);
    };
    const before = await count();
    expect(before).toBeGreaterThan(0);
    await page.goto(`/products/${product.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(product.name);
    const imageUrl = new URL((await page.locator('meta[property="og:image"]').getAttribute("content"))!);
    const beforeImage = await (await request.get(imageUrl.pathname)).body();
    await page.goto(`/products/${peer.slug}`);
    await expect(page.getByRole("link", { name: product.name, exact: true })).toBeVisible();
    await db.insert(reports).values({ targetType: "PRODUCT", productId: product.id,
      reporterId: moderator.userId, reason: "SPAM" });
    await page.goto("/dashboard/moderation");
    entry = page.locator("li").filter({ hasText: product.name }).first();
    await entry.getByLabel("Reason for the action").fill("Hiding this fixture listing.");
    await entry.getByRole("button", { name: "Hide listing", exact: true }).click();
    await expect(entry).toHaveCount(0);
    await page.goto("/categories");
    expect(await count()).toBe(before - 1);
    await page.goto(`/products/${peer.slug}`);
    await expect(page.getByRole("link", { name: product.name, exact: true })).toHaveCount(0);
    const afterImage = await (await request.get(imageUrl.pathname)).body();
    expect(afterImage.equals(beforeImage)).toBe(false);
    const response = await page.goto(`/products/${product.slug}`);
    expect(response?.status()).toBe(404);
  } finally {
    await removeSeededProduct(product);
    await removeSeededProduct(peer);
    await removeSeededAccount(moderator.userId);
  }
});

test("logo image slots match their rendered width", async ({ page }) => {
  await page.goto("/");
  const logos = page.locator('img[src*="logo.png"], img[src*="logo%2Epng"]');
  expect(await logos.count()).toBeGreaterThan(0);
  for (const logo of await logos.all()) {
    if (!(await logo.isVisible())) continue;
    const declared = await logo.getAttribute("sizes");
    const width = await logo.evaluate(el => el.getBoundingClientRect().width);
    expect(declared).toContain(`${width}px`);
  }
});

test("deduplicates render reads but rechecks revoked sessions on the next request", async ({ request }) => {
  const trace = process.env.PERF_QUERY_TRACE;
  test.skip(!process.env.DATABASE_URL || !trace, "Requires local server fetch tracing and development database");
  const product = await seedPublishedProduct();
  const account = await seedSignedInAccount();
  const count = (kind: string) => readFileSync(trace!, "utf8").trim().split("\n")
    .filter(line => line && JSON.parse(line).kind === kind).length;
  try {
    writeFileSync(trace!, "");
    expect((await request.get(`/products/${product.slug}`)).status()).toBe(200);
    expect(count("product-detail")).toBe(1);
    writeFileSync(trace!, "");
    expect((await request.get(`/u/${account.username}`)).status()).toBe(200);
    expect(count("profile")).toBe(1);
    writeFileSync(trace!, "");
    const headers = { cookie: `failproducts_session=${account.token}; __Host-failproducts_session=${account.token}` };
    expect((await request.get("/dashboard/settings", { headers })).status()).toBe(200);
    expect(count("session")).toBe(1);
    await testDb().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, account.userId));
    const denied = await request.get("/dashboard/settings", { headers, maxRedirects: 0 });
    expect(denied.status()).toBe(307);
    expect(denied.headers().location).toBe("/auth/sign-in");
    expect(count("session")).toBe(2);
  } finally {
    await removeSeededProduct(product);
    await removeSeededAccount(account.userId);
  }
});
