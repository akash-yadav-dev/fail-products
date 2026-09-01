// tests/e2e/navigation.spec.ts
import { expect, test } from "@playwright/test";

/**
 * The skeleton's only real behaviour is navigation, so this is what there is to
 * assert. Both viewport projects run this file: the desktop nav and the mobile
 * sheet are different components, and each test skips on the width where its
 * component is not rendered.
 */

/** Tailwind `md`. Below it the header swaps MainNav for MobileNav. */
const MD = 768;

/**
 * Phase 2 turned several of these routes from static pages into database reads.
 *
 * `/products` and `/status/[slug]` rendered from a domain enum and an empty
 * state before; they now query. Without a database they return 500, which is
 * correct — a deployed environment always has DATABASE_URL, and a site quietly
 * rendering an empty directory instead of erroring is the silent failure
 * `docs/ENGINEERING.md` §1.9 forbids. So the tests that need data say so.
 *
 * `/categories` is not in that set: it is prerendered with `revalidate`, so the
 * build-time fallback is served and it still answers 200 here.
 */
const noDatabase = !process.env.DATABASE_URL;

function isMobile(width: number | undefined): boolean {
  return (width ?? MD) < MD;
}

test.describe("the home page", () => {
  test("loads and names the project", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/FailProducts/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("exposes a skip link as the first focusable control", async ({
    page,
  }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    await expect(
      page.getByRole("link", { name: "Skip to content" })
    ).toBeFocused();
  });
});

test.describe("the header navigation", () => {
  const sections = [
    { label: "Products", path: "/products", heading: "Products", needsData: true },
    { label: "Categories", path: "/categories", heading: "Categories", needsData: false },
    { label: "Status", path: "/status", heading: "Status", needsData: false },
  ] as const;

  for (const section of sections) {
    test(`reaches ${section.path}`, async ({ page, viewport }) => {
      test.skip(isMobile(viewport?.width), "MainNav is hidden below md");
      test.skip(
        section.needsData && noDatabase,
        `${section.path} reads the database since Phase 2`
      );

      await page.goto("/");
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: section.label, exact: true })
        .click();

      await expect(page).toHaveURL(new RegExp(`${section.path}$`));
      // The heading by name, not merely "a level-1 heading exists". The root
      // error boundary also renders an h1, so the looser assertion passed
      // against a 500 in CI — a green test on an error page is worse than a red
      // one, because nothing ever looks at it again.
      await expect(
        page.getByRole("heading", { level: 1, name: section.heading })
      ).toBeVisible();
    });
  }

  test("marks the current section as the current page", async ({
    page,
    viewport,
  }) => {
    test.skip(isMobile(viewport?.width), "MainNav is hidden below md");
    test.skip(noDatabase, "/products reads the database since Phase 2");

    await page.goto("/products");

    await expect(
      page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Products", exact: true })
    ).toHaveAttribute("aria-current", "page");
  });
});

test.describe("the mobile menu", () => {
  test("opens, navigates, and closes on navigation", async ({
    page,
    viewport,
  }) => {
    test.skip(!isMobile(viewport?.width), "MobileNav is hidden from md up");

    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    // Located by destination, not by name: the sheet links carry a second
    // description line, so the accessible name is the label plus that line.
    await sheet.locator('a[href="/products"]').click();

    await expect(page).toHaveURL(/\/products$/);
    // The sheet dismisses itself on navigation; nothing tracks open state.
    await expect(sheet).toBeHidden();
  });

  test("closes on Escape without navigating", async ({ page, viewport }) => {
    test.skip(!isMobile(viewport?.width), "MobileNav is hidden from md up");

    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("unknown routes", () => {
  test("an unknown failure status 404s", async ({ page }) => {
    const response = await page.goto("/status/thriving");

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: /did not find traction either/i })
    ).toBeVisible();
  });

  test("a known failure status resolves", async ({ page }) => {
    // The 404 above still runs without a database: notFound() fires before the
    // product query. Rendering the page is what needs one, since Phase 2.
    test.skip(noDatabase, "/status/[slug] lists products since Phase 2");

    const response = await page.goto("/status/shut-down");

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: "Shut down" })
    ).toBeVisible();
  });

  test("an unknown path 404s", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist");

    expect(response?.status()).toBe(404);
  });
});

test.describe("layout", () => {
  test("does not scroll horizontally", async ({ page, viewport }) => {
    await page.goto("/");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );

    expect(overflow, `horizontal scroll at ${viewport?.width}px`).toBe(false);
  });
});
