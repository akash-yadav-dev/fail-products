// tests/e2e/directory-appearance.spec.ts
import { expect, test } from "@playwright/test";

import {
  removeSeededProduct,
  seedPublishedProduct,
  type SeededProduct,
} from "./fixtures/seed-product";

/**
 * The Phase 2 exit gate's last line: every page still works at 360px, light and
 * dark.
 *
 * The two viewports come from playwright.config.ts, which runs this file at 360
 * and 1280. The two themes come from `emulateMedia` — the app uses next-themes
 * with `defaultTheme="system"` and `enableSystem`, so `prefers-color-scheme` is
 * what decides for a visitor who has never touched the toggle, which is most of
 * them.
 *
 * These pages were empty states until this phase. Every one of them now renders
 * real rows, a sort control, a search box, and cards, and none of that had been
 * seen in dark mode by anything but a person's eye.
 */
const noDatabase = !process.env.DATABASE_URL;

const PAGES = [
  { path: "/products", name: "the directory" },
  { path: "/categories", name: "the category index" },
  { path: "/categories/ai", name: "a category" },
  { path: "/status/abandoned", name: "a status" },
];

test.describe("the directory in both themes", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — every page here is a query");

  let seeded: SeededProduct;

  test.beforeAll(async () => {
    if (noDatabase) return;
    seeded = await seedPublishedProduct();
  });

  test.afterAll(async () => {
    if (noDatabase || !seeded) return;
    await removeSeededProduct(seeded);
  });

  for (const scheme of ["light", "dark"] as const) {
    for (const target of PAGES) {
      test(`${target.name} does not overflow in ${scheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(target.path);

        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        // A public directory that scrolls sideways on a phone is broken for
        // most of its visitors (docs/DESIGN.md §9).
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth
        );
        expect(overflow).toBe(false);
      });
    }

    test(`a product page reads correctly in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/products/${seeded.slug}`);

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        seeded.name
      );
      // The source tier has to survive a theme change. It is the one label
      // docs/LEGAL.md §3 makes mandatory, and a badge that disappears against
      // its own background has stopped carrying it.
      await expect(page.getByText("Claimed by creator").first()).toBeVisible();

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth
      );
      expect(overflow).toBe(false);
    });
  }
});
