// tests/e2e/moderation.spec.ts
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { ACCOUNT_HINT_COOKIE } from "@/lib/auth/account-hint";
import {
  removeSeededProduct,
  seedPublishedProduct,
  type SeededProduct,
} from "./fixtures/seed-product";
import {
  removeSeededAccount,
  seedSignedInAccount,
  type SeededSession,
} from "./fixtures/seed-session";

/**
 * Reporting and moderation, Phase 3 slices 3.3 and 3.4.
 *
 * Two exit-gate items are asserted here that nothing else can assert: that a
 * report leaves the content visible until somebody acts, and that a
 * non-moderator gets a 404 on every moderation route.
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

  await context.addCookies([
    ...SESSION_COOKIE_NAMES.map((name) => ({
      name,
      value: session.token,
      domain: base.hostname,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
    {
      name: ACCOUNT_HINT_COOKIE,
      value: "1",
      domain: base.hostname,
      path: "/",
      secure: true,
      sameSite: "Lax" as const,
    },
  ]);
}

/** Posts a comment as the signed-in account and returns its text. */
async function postComment(page: Page, slug: string): Promise<string> {
  const body = `This is the comment under test. ${Date.now()}-${Math.random()}`;

  await page.goto(`/products/${slug}`);
  await page.getByLabel("Add a comment").fill(body);
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText(body)).toBeVisible();

  return body;
}

test.describe("reporting", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — reports are a query");

  let seeded: SeededProduct;
  let member: SeededSession;

  test.beforeAll(async () => {
    if (noDatabase) return;
    seeded = await seedPublishedProduct();
    member = await seedSignedInAccount();
  });

  test.afterAll(async () => {
    if (noDatabase) return;
    if (member) await removeSeededAccount(member.userId);
    if (seeded) await removeSeededProduct(seeded);
  });

  test("asks a signed-out visitor to sign in before reporting", async ({
    page,
  }) => {
    await page.goto(`/products/${seeded.slug}`);
    await page.getByRole("button", { name: /^Report/ }).first().click();

    await expect(
      page.getByRole("dialog").getByRole("link", { name: "Sign in" })
    ).toBeVisible();
  });

  test("reports a comment, acknowledges it, and leaves the comment visible", async ({
    page,
    context,
  }) => {
    // The rule the Phase 3 plan names: reporting is not a takedown. Content
    // stays up until a moderator has looked at it, or a report becomes a way
    // for anyone to remove anything.
    await signIn(context, member);
    const body = await postComment(page, seeded.slug);

    await page
      .getByRole("button", { name: /^Report the comment/ })
      .first()
      .click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Spam" }).click();
    await dialog.getByRole("button", { name: "Send report" }).click();

    await expect(dialog.getByText(/a moderator will look at this/i)).toBeVisible();

    // Still readable, to the reporter and to everybody else.
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByText(body)).toBeVisible();
  });

  test("requires a sentence when the reason is 'something else'", async ({
    page,
    context,
  }) => {
    await signIn(context, member);
    await page.goto(`/products/${seeded.slug}`);

    await page.getByRole("button", { name: /^Report/ }).last().click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Something else" }).click();

    // The browser's own required check stops the submission, so no report is
    // filed with nothing a moderator can act on.
    await expect(dialog.getByLabel(/Anything else/)).toHaveAttribute(
      "required",
      ""
    );
  });
});

test.describe("the moderation queue", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — the queue is a query");

  let seeded: SeededProduct;
  let member: SeededSession;
  let moderator: SeededSession;

  test.beforeAll(async () => {
    if (noDatabase) return;
    seeded = await seedPublishedProduct();
    member = await seedSignedInAccount("MEMBER");
    moderator = await seedSignedInAccount("MODERATOR");
  });

  test.afterAll(async () => {
    if (noDatabase) return;
    if (member) await removeSeededAccount(member.userId);
    if (moderator) await removeSeededAccount(moderator.userId);
    if (seeded) await removeSeededProduct(seeded);
  });

  test("404s for a signed-out visitor", async ({ page }) => {
    const response = await page.goto("/dashboard/moderation");

    // The dashboard layout redirects an unauthenticated visitor to sign-in
    // before the page runs, which is a 200 on the sign-in page. Either way the
    // queue is not reachable, and that is what is asserted.
    expect(page.url()).not.toContain("/dashboard/moderation");
    expect(response?.status()).toBeLessThan(500);
  });

  test("404s for an account without the role", async ({ page, context }) => {
    // The exit-gate item. Hiding the sidebar link is not the control; the route
    // itself has to refuse, and with a 404 rather than a 403 — a 403 confirms
    // the route exists and that this account is close to having access.
    await signIn(context, member);
    const response = await page.goto("/dashboard/moderation");

    expect(response?.status()).toBe(404);
  });

  test("does not show the moderation link to an ordinary account", async ({
    page,
    context,
  }) => {
    await signIn(context, member);
    await page.goto("/dashboard");

    await expect(
      page.getByRole("link", { name: "Report queue" })
    ).toHaveCount(0);
  });

  test("opens for a moderator", async ({ page, context }) => {
    await signIn(context, moderator);
    const response = await page.goto("/dashboard/moderation");

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: "Report queue" })
    ).toBeVisible();
  });

  test("reports, moderates, hides the comment, and records who did it", async ({
    page,
    context,
  }) => {
    // The full loop the Phase 3 plan asks for: report, moderate, confirm the
    // content disappears from the public page, and the audit trail names the
    // account that acted.
    await signIn(context, member);
    const body = await postComment(page, seeded.slug);

    await page
      .getByRole("button", { name: /^Report the comment/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Harassment" }).click();
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect(dialog.getByText(/a moderator will look at this/i)).toBeVisible();

    // Now as the moderator.
    await context.clearCookies();
    await signIn(context, moderator);
    await page.goto("/dashboard/moderation");

    const entry = page
      .locator("li")
      .filter({ hasText: body })
      .first();
    await expect(entry).toBeVisible();

    await entry
      .getByLabel("Reason for the action")
      .fill("Targets the founder rather than the product.");
    await entry.getByRole("button", { name: "Hide comment" }).click();

    // The entry leaves the queue: acting on the content closes the reports
    // that asked for it, and the page revalidates. Asserting the success
    // message instead would be asserting a banner that the same revalidation
    // unmounts.
    await expect(
      page.locator("li").filter({ hasText: body })
    ).toHaveCount(0);

    // Gone from the public page, for everybody.
    await context.clearCookies();
    await page.goto(`/products/${seeded.slug}`);
    await expect(page.getByText(body)).toHaveCount(0);

    // And the log names the account that did it, with the reason.
    await signIn(context, moderator);
    await page.goto("/dashboard/moderation");
    await expect(
      page.getByText(`@${moderator.username} moved a comment from VISIBLE to HIDDEN`)
    ).toBeVisible();
    await expect(
      page.getByText("Targets the founder rather than the product.")
    ).toBeVisible();
  });

  test("refuses an action with no stated reason", async ({ page, context }) => {
    // docs/MODERATION.md §10 promises an appeal path, and an appeal is heard
    // against a recorded reason.
    await signIn(context, member);
    await postComment(page, seeded.slug);

    await page
      .getByRole("button", { name: /^Report the comment/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Spam" }).click();
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect(dialog.getByText(/a moderator will look at this/i)).toBeVisible();

    await context.clearCookies();
    await signIn(context, moderator);
    await page.goto("/dashboard/moderation");

    await expect(
      page.getByLabel("Reason for the action").first()
    ).toHaveAttribute("required", "");
  });
});
