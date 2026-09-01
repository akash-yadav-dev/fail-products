// tests/e2e/dashboard.spec.ts
import { expect, test } from "@playwright/test";

/**
 * The dashboard is a separate surface from the public site: its own sidebar,
 * its own header, and none of the marketing chrome. Several of these assertions
 * exist to keep it that way — app/(site)/layout.tsx and the dashboard layout
 * are easy to re-merge by accident.
 */

const MD = 768;

function isMobile(width: number | undefined): boolean {
  return (width ?? MD) < MD;
}

/**
 * SidebarTrigger and SidebarRail both carry the name "Toggle Sidebar" — the
 * rail is the drag edge between the sidebar and the content. Scope to the
 * header so the locator stays unambiguous.
 */
function sidebarToggle(page: import("@playwright/test").Page) {
  return page.getByRole("banner").getByRole("button", { name: "Toggle Sidebar" });
}

/** The sidebar is a fixed panel from md up and a sheet below it. */
function sidebar(page: import("@playwright/test").Page, width: number | undefined) {
  return isMobile(width)
    ? page.getByRole("dialog")
    : page.locator('[data-slot="sidebar"]').first();
}

test.beforeEach(async ({ page }) => {
  // The local Playwright build exposes a test-only session cookie so the shell
  // can still be exercised without sending real email. Production rejects this
  // route and the dashboard always requires a real server-side session.
  await page.goto("/api/auth/test-session");
});

test.describe("the dashboard shell", () => {
  test("loads and names the section", async ({ page }) => {
    const response = await page.goto("/dashboard");

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: "Overview" })
    ).toBeVisible();
  });

  test("is excluded from search results", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/
    );
  });

  test("does not render the marketing header or footer", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(
      page.getByRole("navigation", { name: "Main" })
    ).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toHaveCount(0);
  });

  test("renders only after the test session is established", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  });

  test("exposes a skip link as the first focusable control", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Tab");

    await expect(
      page.getByRole("link", { name: "Skip to content" })
    ).toBeFocused();
  });

  test("does not scroll horizontally", async ({ page, viewport }) => {
    await page.goto("/dashboard");

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    );

    expect(overflow, `horizontal scroll at ${viewport?.width}px`).toBe(false);
  });
});

test.describe("the sidebar", () => {
  const sections = [
    { label: "Products", path: "/dashboard/products", heading: "Products" },
    { label: "Settings", path: "/dashboard/settings", heading: "Settings" },
  ] as const;

  for (const section of sections) {
    test(`reaches ${section.path}`, async ({ page, viewport }) => {
      await page.goto("/dashboard");

      if (isMobile(viewport?.width)) {
        // Below md the sidebar is a sheet, so it has to be opened first.
        await sidebarToggle(page).click();
      }

      // Scoped to the sidebar: the page content links to these sections too,
      // and on mobile those copies sit behind the open sheet.
      await sidebar(page, viewport?.width)
        .locator(`a[href="${section.path}"]`)
        .click();

      await expect(page).toHaveURL(new RegExp(`${section.path}$`));
      await expect(
        page.getByRole("heading", { level: 1, name: section.heading })
      ).toBeVisible();
    });
  }

  test("marks the current section as the current page", async ({
    page,
    viewport,
  }) => {
    test.skip(isMobile(viewport?.width), "the sidebar is a sheet below md");

    await page.goto("/dashboard/products");

    await expect(
      page.locator('a[href="/dashboard/products"]').first()
    ).toHaveAttribute("aria-current", "page");
  });

  test("does not mark Overview active on a child route", async ({
    page,
    viewport,
  }) => {
    test.skip(isMobile(viewport?.width), "the sidebar is a sheet below md");

    // "/dashboard" is a prefix of every dashboard route; only an exact match
    // may highlight it, or the whole sidebar reads as active at once.
    await page.goto("/dashboard/settings");

    await expect(
      page.locator('a[href="/dashboard"]').first()
    ).not.toHaveAttribute("aria-current", "page");
  });

  test("collapses and expands from the header trigger", async ({
    page,
    viewport,
  }) => {
    test.skip(isMobile(viewport?.width), "the sidebar is a sheet below md");

    await page.goto("/dashboard");

    const sidebar = page.locator('[data-slot="sidebar"]').first();
    await expect(sidebar).toHaveAttribute("data-state", "expanded");

    await sidebarToggle(page).click();
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");

    await sidebarToggle(page).click();
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
  });

  test("opens as a sheet and closes on navigation", async ({
    page,
    viewport,
  }) => {
    test.skip(!isMobile(viewport?.width), "the sidebar is fixed from md up");

    await page.goto("/dashboard");
    await sidebarToggle(page).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    await sheet.locator('a[href="/dashboard/settings"]').click();

    await expect(page).toHaveURL(/\/dashboard\/settings$/);
    await expect(sheet).toBeHidden();
  });
});

test.describe("the breadcrumb", () => {
  test("names the section on a child route", async ({ page }) => {
    await page.goto("/dashboard/products");

    const breadcrumb = page.getByRole("navigation", { name: "breadcrumb" });

    await expect(breadcrumb.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(breadcrumb.getByText("Products")).toBeVisible();
  });

  test("does not link to itself on the root route", async ({ page }) => {
    await page.goto("/dashboard");

    const breadcrumb = page.getByRole("navigation", { name: "breadcrumb" });

    // shadcn's BreadcrumbPage is a <span role="link" aria-disabled>, so the
    // assertion is about anchors: the current page must not be navigable.
    await expect(breadcrumb.locator("a")).toHaveCount(0);
    await expect(breadcrumb.getByText("Dashboard")).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});

test.describe("the placeholder states", () => {
  test("the products table renders its columns and an empty state", async ({
    page,
  }) => {
    await page.goto("/dashboard/products");

    await expect(
      page.getByRole("columnheader", { name: "Product" })
    ).toBeVisible();
    await expect(
      page.getByText(/you have not listed anything/i)
    ).toBeVisible();
  });

  test("the filter is disabled while there is nothing to filter", async ({
    page,
  }) => {
    await page.goto("/dashboard/products");

    await expect(page.getByRole("searchbox")).toBeDisabled();
  });

  test("the settings form is inert", async ({ page }) => {
    await page.goto("/dashboard/settings");

    await expect(page.getByLabel("Display name")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  test("no metric claims a number", async ({ page }) => {
    await page.goto("/dashboard");

    // Every metric is a skeleton until a data layer exists. A digit appearing
    // in a metric card means something started asserting a value.
    const values = await page
      .locator('[data-slot="card-title"]')
      .allInnerTexts();

    for (const value of values) {
      expect(value.trim()).not.toMatch(/\d/);
    }
  });
});
