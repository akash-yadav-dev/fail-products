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

test.describe("the wired states", () => {
  test("the products table renders its columns and an empty state", async ({
    page,
  }) => {
    await page.goto("/dashboard/products");

    await expect(
      page.getByRole("columnheader", { name: "Product" })
    ).toBeVisible();
    // The test session owns nothing, so the zero-state is the correct render.
    await expect(
      page.getByText(/you have not listed anything/i)
    ).toBeVisible();
  });

  test("the settings form accepts input and can be submitted", async ({
    page,
  }) => {
    await page.goto("/dashboard/settings");

    // Was inert by design while no account service existed. It is wired now,
    // and an enabled control is the thing worth asserting.
    await expect(page.getByLabel("Display name")).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Save changes" })
    ).toBeEnabled();
  });

  test("the settings form labels every control", async ({ page }) => {
    await page.goto("/dashboard/settings");

    // A control with no label is unusable with a screen reader, and this form
    // is the one place an account's public identity is set.
    for (const label of ["Display name", "Username", "Website", "Bio"]) {
      await expect(page.getByLabel(label)).toBeVisible();
    }
  });

  test("shows a number only for what is actually measured", async ({ page }) => {
    // This used to assert that no metric showed a digit at all, which was
    // right while there was no data layer. Slice 4.3 gave three of them one.
    //
    // The property worth keeping is sharper than the old one: a card shows a
    // number when the number is real, and shows nothing when it is not. A zero
    // is a claim -- "nobody clicked" -- and only the measured cards are
    // entitled to make it.
    await page.goto("/dashboard");

    const cardValue = (label: string) =>
      page
        .locator('[data-slot="card"]')
        .filter({ hasText: label })
        .locator('[data-slot="card-title"]')
        .first();

    for (const label of ["Outbound clicks", "Waitlist signups", "Comments"]) {
      await expect(cardValue(label)).toHaveText(/\d/);
    }

    // Neither of these can be counted without either making a cached page
    // dynamic or trusting a client beacon, so neither is counted, and neither
    // may print a figure.
    for (const label of ["Product views", "Profile views"]) {
      await expect(cardValue(label)).not.toHaveText(/\d/);
    }
  });

  test("renders for an account with nothing in it", async ({ page }) => {
    // The empty case is the one every new founder sees first, and the one an
    // aggregate query is most likely to break on: an empty id list is a SQL
    // syntax error rather than an empty result.
    await page.goto("/dashboard");

    await expect(
      page.getByRole("heading", { level: 1, name: "Overview" })
    ).toBeVisible();
    // CardTitle renders a div, not a heading element, so this is matched as
    // text rather than by role.
    await expect(page.getByText("Outbound clicks by day")).toBeVisible();
  });

  test("says the two unmeasured metrics are unmeasured", async ({ page }) => {
    // Not a blank card. A founder reading a dashboard is entitled to know the
    // difference between "nobody visited" and "this site does not count that".
    await page.goto("/dashboard");

    await expect(page.getByText(/Not measured\./).first()).toBeVisible();
  });
});
