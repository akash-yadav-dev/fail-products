// tests/e2e/waitlist.spec.ts
import { expect, test, type Page } from "@playwright/test";

import {
  removeSeededProduct,
  seedPublishedProduct,
  type SeededProduct,
} from "./fixtures/seed-product";
import {
  countEntries,
  enableWaitlist,
  seedPendingEntry,
  waitlistAddress,
} from "./fixtures/seed-waitlist";

/**
 * Joining a waitlist, Phase 4 slice 4.1.
 *
 * These run at both viewport projects, so "usable at 360px" is a property of
 * every test here rather than a separate one — and the keyboard test below runs
 * at 360 as well, which is what the plan actually asks for.
 */

const noDatabase = !process.env.DATABASE_URL;

/** Fills and submits the form with the pointer. */
async function join(page: Page, email: string) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/I agree to receive email/).check();
  await page.getByRole("button", { name: /^Join the/ }).click();
}

test.describe("waitlist", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — the waitlist is a query");

  let seeded: SeededProduct;

  test.beforeAll(async () => {
    if (noDatabase) return;
    seeded = await seedPublishedProduct();
    await enableWaitlist(seeded.id);
  });

  test.afterAll(async () => {
    if (noDatabase) return;
    // Entries cascade with the product, which is the retention rule in
    // docs/LEGAL.md §5 as well as the cleanup this test wants.
    if (seeded) await removeSeededProduct(seeded);
  });

  test("offers the form to a signed-out visitor", async ({ page }) => {
    // docs/PRODUCT.md §13 lists "join a waitlist" among the things a
    // non-logged-in visitor can do. Unlike commenting, there is no sign-in
    // prompt in the way.
    await page.goto(`/products/${seeded.slug}`);

    await expect(
      page.getByRole("heading", { name: "Hear if it comes back" })
    ).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
  });

  test("joins, and says to check the inbox rather than claiming it is done", async ({
    page,
  }) => {
    // Double opt-in (ADR-028): the address is not on the list until the link in
    // the email is followed, and the message has to say so or the visitor is
    // told something untrue.
    await page.goto(`/products/${seeded.slug}`);

    await join(page, waitlistAddress());

    await expect(page.getByText(/Check your inbox/)).toBeVisible();
  });

  test("joining twice does not duplicate the entry", async ({ page }) => {
    const email = waitlistAddress();

    await page.goto(`/products/${seeded.slug}`);
    await join(page, email);
    await expect(page.getByText(/Check your inbox/)).toBeVisible();

    await page.reload();
    await join(page, email);
    // The same answer both times, deliberately: "you are already on this list"
    // would make the form an oracle for who has subscribed to what.
    await expect(page.getByText(/Check your inbox/)).toBeVisible();

    expect(await countEntries(seeded.id, email)).toBe(1);
  });

  test("refuses a signup with the consent box left unticked", async ({
    page,
  }) => {
    // The browser's own `required` blocks the submit, so the field never
    // reaches the server. That is the behaviour worth pinning: the consent
    // record is the lawful basis for every later email, and the first line of
    // defence should be the one that costs no round trip.
    const email = waitlistAddress();

    await page.goto(`/products/${seeded.slug}`);
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: /^Join the/ }).click();

    await expect(page.getByText(/Check your inbox/)).toHaveCount(0);
    expect(await countEntries(seeded.id, email)).toBe(0);
  });

  test("is completable at this viewport by keyboard alone", async ({ page }) => {
    // The plan's requirement, run at 360px by the mobile project. Nothing here
    // clicks: if any control is unreachable by Tab, or the checkbox does not
    // answer to Space, the flow stops and this fails.
    const email = waitlistAddress();

    await page.goto(`/products/${seeded.slug}`);

    // Tab in from the top of the document rather than focusing the field
    // directly — reaching the form is half of what is being tested.
    const reached = await tabTo(page, "waitlist-email");
    expect(reached, "the email field was not reachable by Tab").toBe(true);

    await page.keyboard.type(email);

    expect(await tabTo(page, "waitlist-consent")).toBe(true);
    await page.keyboard.press("Space");
    await expect(page.getByLabel(/I agree to receive email/)).toBeChecked();

    // And the submit button, reached the same way and fired with Enter.
    const submit = page.getByRole("button", { name: /^Join the/ });
    await page.keyboard.press("Tab");
    await expect(submit).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByText(/Check your inbox/)).toBeVisible();
    expect(await countEntries(seeded.id, email)).toBe(1);
  });

  test("keeps the form inside the viewport, with no horizontal scroll", async ({
    page,
  }) => {
    await page.goto(`/products/${seeded.slug}`);

    const field = page.getByLabel("Email address");
    const bounds = (await field.boundingBox())!;
    const viewport = page.viewportSize()!;

    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);

    // 16px or larger below `md`, or iOS zooms the page on focus and the form
    // becomes unusable exactly where it is hardest to recover from.
    if (viewport.width < 768) {
      const fontSize = await field.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize)
      );
      expect(fontSize).toBeGreaterThanOrEqual(16);
    }
  });

  test("shows no signup form on a listing whose waitlist is off", async ({
    page,
  }) => {
    // The section is absent from the HTML, not hidden — a form that collects
    // addresses the action then refuses is worse than no form.
    const other = await seedPublishedProduct();

    try {
      await page.goto(`/products/${other.slug}`);

      await expect(page.getByLabel("Email address")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Hear if it comes back" })
      ).toHaveCount(0);
    } finally {
      await removeSeededProduct(other);
    }
  });
});

test.describe("waitlist confirmation and removal", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — the waitlist is a query");

  let seeded: SeededProduct;

  test.beforeAll(async () => {
    if (noDatabase) return;
    seeded = await seedPublishedProduct();
    await enableWaitlist(seeded.id);
  });

  test.afterAll(async () => {
    if (noDatabase) return;
    if (seeded) await removeSeededProduct(seeded);
  });

  test("confirms a pending entry from the link in the email", async ({
    page,
  }) => {
    const entry = await seedPendingEntry(seeded.id);

    await page.goto(`/waitlist/confirm?token=${encodeURIComponent(entry.token)}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "You are on the list" })
    ).toBeVisible();
    expect(await countEntries(seeded.id, entry.email)).toBe(1);
  });

  test("keeps the confirmation page out of search results", async ({ page }) => {
    // The URL carries a one-time secret. Nothing here should be indexed, and
    // nothing here is worth indexing.
    const entry = await seedPendingEntry(seeded.id);

    await page.goto(`/waitlist/confirm?token=${encodeURIComponent(entry.token)}`);

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/
    );
  });

  test("treats a token nobody issued as spent rather than as an error", async ({
    page,
  }) => {
    const response = await page.goto("/waitlist/confirm?token=not-a-real-token");

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: /already been used/ })
    ).toBeVisible();
  });

  test("erases an entry when the subscriber asks", async ({ page }) => {
    // docs/LEGAL.md §5: a waitlist entry is erased on request by the
    // subscriber. Deleted, not flagged — a row that still holds the address has
    // not been deleted.
    const entry = await seedPendingEntry(seeded.id);
    expect(await countEntries(seeded.id, entry.email)).toBe(1);

    await page.goto(
      `/waitlist/unsubscribe?token=${encodeURIComponent(entry.token)}`
    );

    await page.getByRole("button", { name: "Remove my email" }).click();
    await expect(page.getByText(/deleted, not flagged/)).toBeVisible();

    expect(await countEntries(seeded.id, entry.email)).toBe(0);
  });

  test("does not erase anything merely by opening the link", async ({
    page,
  }) => {
    // The reason removal is a button and confirmation is not: mail clients
    // prefetch links, and a prefetcher that deleted somebody's subscription
    // would be destroying data on nobody's instruction.
    const entry = await seedPendingEntry(seeded.id);

    await page.goto(
      `/waitlist/unsubscribe?token=${encodeURIComponent(entry.token)}`
    );
    await expect(
      page.getByRole("button", { name: "Remove my email" })
    ).toBeVisible();

    expect(await countEntries(seeded.id, entry.email)).toBe(1);
  });
});

/**
 * Tabs forward until the element with `id` has focus.
 *
 * Bounded, so a form that never reaches the control fails the test rather than
 * hanging the suite. The bound is generous because the header, the skip link,
 * the breadcrumb, and every comment above the form are all in the tab order —
 * which is the point: the control has to be reachable through all of them.
 */
async function tabTo(page: Page, id: string, limit = 60): Promise<boolean> {
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press("Tab");

    const focused = await page.evaluate(() => document.activeElement?.id ?? "");
    if (focused === id) return true;
  }

  return false;
}
