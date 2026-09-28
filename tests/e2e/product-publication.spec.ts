// tests/e2e/product-publication.spec.ts
import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import {
  hideSeededProduct,
  removeSeededProduct,
  seedDraftProductFor,
} from "./fixtures/seed-product";
import {
  removeSeededAccount,
  seedSignedInAccount,
  type SeededSession,
} from "./fixtures/seed-session";

/**
 * Publishing and editing a listing.
 *
 * This is the regression test for the blocker
 * `.plans/2026-09-14-launch-readiness-findings.md` names: before these
 * controls existed, `changePublicationState` had no caller anywhere in
 * `src/app` or `src/components`. A submitted product was created as a `DRAFT`
 * and nothing in the application could move it out.
 *
 * So every assertion here is about the **wiring**, not the state machine. The
 * legal and illegal transitions are covered by
 * `tests/integration/product-service.test.ts` and the domain unit tests. The
 * proof that matters is the public URL: a private page could render
 * "PUBLISHED" while the listing stayed unreachable.
 *
 * Each test seeds its own account and draft rather than sharing a `beforeAll`
 * product, because `fullyParallel` may run the tests in a file across workers.
 * A shared row would make test order decide the result.
 */

const noDatabase = !process.env.DATABASE_URL;

const SESSION_COOKIE_NAMES = [
  "__Host-failproducts_session",
  "failproducts_session",
];

async function signIn(context: BrowserContext, session: SeededSession) {
  const base = new URL(
    process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100"
  );

  // Both names: the build under test is production, so it reads the `__Host-`
  // prefixed cookie, while a dev server would read the unprefixed one. The
  // browser sends whichever the server asks for, and a wrong guess here would
  // look like a broken session rather than a broken test.
  await context.addCookies(
    SESSION_COOKIE_NAMES.map((name) => ({
      name,
      value: session.token,
      domain: base.hostname,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax" as const,
    }))
  );
}

/** A draft and the account that owns it, with their own cleanup. */
async function seedOwnedDraft() {
  const session = await seedSignedInAccount();
  const product = await seedDraftProductFor(session);

  return {
    session,
    product,
    cleanup: async () => {
      // removeSeededProduct also removes the owning account.
      await removeSeededProduct(product);
    },
  };
}

/** The one row for a listing, in the dashboard products table. */
function rowFor(page: Page, name: string) {
  return page.getByRole("row").filter({ hasText: name });
}

test.describe("publishing a listing", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — publishing is a write");

  test("a draft is not publicly reachable", async ({ page }) => {
    const seeded = await seedOwnedDraft();
    try {
      const response = await page.goto(`/products/${seeded.product.slug}`);

      expect(response?.status()).toBe(404);
    } finally {
      await seeded.cleanup();
    }
  });

  test("the owner publishes it and it becomes publicly reachable", async ({
    page,
    context,
  }) => {
    const seeded = await seedOwnedDraft();
    try {
      await signIn(context, seeded.session);
      await page.goto("/dashboard/products");

      const row = rowFor(page, seeded.product.name);
      await expect(row).toBeVisible();

      await row.getByRole("button", { name: "Publish" }).click();

      await expect(
        page.getByText("Published. It is on the public directory now.")
      ).toBeVisible();
      // The row now offers the reverse move — the state machine's answer, not
      // this component's.
      await expect(row.getByRole("button", { name: "Unpublish" })).toBeVisible();

      const response = await page.goto(`/products/${seeded.product.slug}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByText(seeded.product.name).first()).toBeVisible();
    } finally {
      await seeded.cleanup();
    }
  });

  test("the owner edits the details and the public page follows", async ({
    page,
    context,
  }) => {
    const seeded = await seedOwnedDraft();
    try {
      await signIn(context, seeded.session);
      await page.goto("/dashboard/products");

      // Publish first, so the public page is a real destination to assert on.
      await rowFor(page, seeded.product.name)
        .getByRole("button", { name: "Publish" })
        .click();
      await expect(
        page.getByText("Published. It is on the public directory now.")
      ).toBeVisible();

      await rowFor(page, seeded.product.name)
        .getByRole("link", { name: "Edit" })
        .click();
      await expect(page).toHaveURL(/\/dashboard\/products\/[^/]+\/edit$/);

      const tagline = `Corrected after launch ${Date.now()}`;
      await page.getByLabel("Tagline").fill(tagline);
      await page.getByRole("button", { name: "Save changes" }).click();

      await expect(page.getByRole("status")).toContainText("Saved.");
      await expect(page.getByLabel("Tagline")).toHaveValue(tagline);

      await page.goto(`/products/${seeded.product.slug}`);
      await expect(page.getByText(tagline)).toBeVisible();
    } finally {
      await seeded.cleanup();
    }
  });

  test("a moderated published listing is not described as live", async ({
    page,
    context,
  }) => {
    const seeded = await seedOwnedDraft();
    try {
      await signIn(context, seeded.session);
      await page.goto("/dashboard/products");
      await rowFor(page, seeded.product.name)
        .getByRole("button", { name: "Publish" })
        .click();
      await expect(
        page.getByText("Published. It is on the public directory now.")
      ).toBeVisible();

      await hideSeededProduct(seeded.product);
      await page.goto(`/dashboard/products/${seeded.product.id}/edit`);

      await expect(
        page.getByText("Published, but hidden from the public directory by moderation.")
      ).toBeVisible();
      await expect(page.getByText("Live on the public directory.")).toHaveCount(0);
      await expect(
        page.locator(`a[href="/products/${seeded.product.slug}"]`)
      ).toHaveCount(0);

      await page.goto("/dashboard/products");
      await rowFor(page, seeded.product.name)
        .getByRole("button", { name: "Unpublish" })
        .click();
      await rowFor(page, seeded.product.name)
        .getByRole("button", { name: "Publish" })
        .click();
      await expect(
        page.getByText("Published, but hidden from the public directory by moderation.")
      ).toBeVisible();
    } finally {
      await seeded.cleanup();
    }
  });

  test("another account cannot open the edit page", async ({
    page,
    context,
  }) => {
    const seeded = await seedOwnedDraft();
    const other = await seedSignedInAccount();
    try {
      await signIn(context, other);

      const response = await page.goto(
        `/dashboard/products/${seeded.product.id}/edit`
      );

      // 404 rather than 403: an authorization answer that differs from a
      // missing record is a way to learn which product ids exist
      // (docs/SECURITY.md §3).
      expect(response?.status()).toBe(404);
    } finally {
      await removeSeededAccount(other.userId);
      await seeded.cleanup();
    }
  });
});
