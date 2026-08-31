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
    { label: "Products", path: "/products" },
    { label: "Categories", path: "/categories" },
    { label: "Status", path: "/status" },
  ] as const;

  for (const section of sections) {
    test(`reaches ${section.path}`, async ({ page, viewport }) => {
      test.skip(isMobile(viewport?.width), "MainNav is hidden below md");

      await page.goto("/");
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: section.label, exact: true })
        .click();

      await expect(page).toHaveURL(new RegExp(`${section.path}$`));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }

  test("marks the current section as the current page", async ({
    page,
    viewport,
  }) => {
    test.skip(isMobile(viewport?.width), "MainNav is hidden below md");

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
