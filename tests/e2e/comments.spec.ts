// tests/e2e/comments.spec.ts
import { expect, test, type BrowserContext } from "@playwright/test";

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
 * Community discussion, Phase 3 slice 3.2.
 *
 * These run at both viewports, so the 360px requirement in the plan — "the
 * comment box is usable at 360px" — is not a separate test but a property of
 * every test here.
 */

const noDatabase = !process.env.DATABASE_URL;

/**
 * The session cookie's name, as the **server under test** computes it.
 *
 * It cannot be imported. `sessionCookieConfig()` reads `NODE_ENV` at module
 * load, and the Playwright process is not the server process: the server runs
 * `next start`, so it is in production mode and uses the `__Host-` prefix,
 * while this process is not and would resolve the unprefixed name. Setting both
 * is the honest fix — the browser sends whichever one the server asks for, and
 * a wrong guess here would look like a broken session rather than a broken
 * test.
 *
 * Chrome accepts a `Secure` cookie over http on localhost, which is what makes
 * the prefixed name work at all against a local build.
 */
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
      // The hint the composer reads. Not a credential: the Server Action
      // re-authenticates against the session cookie above.
      name: ACCOUNT_HINT_COOKIE,
      value: "1",
      domain: base.hostname,
      path: "/",
      secure: true,
      sameSite: "Lax" as const,
    },
  ]);
}

test.describe("comments", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — comments are a query");

  let seeded: SeededProduct;
  let session: SeededSession;

  test.beforeAll(async () => {
    if (noDatabase) return;
    seeded = await seedPublishedProduct();
    session = await seedSignedInAccount();
  });

  test.afterAll(async () => {
    if (noDatabase) return;
    if (session) await removeSeededAccount(session.userId);
    if (seeded) await removeSeededProduct(seeded);
  });

  test("asks a signed-out visitor to sign in rather than showing a form", async ({
    page,
  }) => {
    await page.goto(`/products/${seeded.slug}`);

    // Scoped to the section: the site header carries its own "Sign in" link,
    // and an unscoped locator would pass on that one alone.
    await expect(
      page.locator("#discussion").getByRole("link", { name: "Sign in" })
    ).toBeVisible();
    await expect(page.getByLabel("Add a comment")).toHaveCount(0);
  });

  test("keeps the discussion readable without an account", async ({ page }) => {
    // The half that matters for a public directory: reading is open, writing
    // is not. A comment section that disappears when you sign out would take
    // the page's actual content with it.
    await page.goto(`/products/${seeded.slug}`);

    await expect(
      page.getByRole("heading", { name: /Community discussion/i })
    ).toBeVisible();
  });

  test("labels the discussion as community opinion, not a verdict", async ({
    page,
  }) => {
    // docs/LEGAL.md §3 and docs/MODERATION.md §8. This page publishes
    // adversarial content about a named real business; an unlabelled comment
    // reads as FailProducts asserting a fact.
    await page.goto(`/products/${seeded.slug}`);

    await expect(page.getByText("Community opinion").first()).toBeVisible();
  });

  test("posts a comment and shows it on the page", async ({ page, context }) => {
    await signIn(context, session);
    await page.goto(`/products/${seeded.slug}`);

    const body = `It lost me at the pricing page. ${Date.now()}`;
    await page.getByLabel("Add a comment").fill(body);
    await page.getByRole("button", { name: "Post comment" }).click();

    await expect(page.getByText(body)).toBeVisible();
  });

  test("survives a reload, and outlives the session that wrote it", async ({
    page,
    context,
  }) => {
    await signIn(context, session);
    await page.goto(`/products/${seeded.slug}`);

    const body = `The onboarding never explained the second step. ${Date.now()}`;
    await page.getByLabel("Add a comment").fill(body);
    await page.getByRole("button", { name: "Post comment" }).click();
    await expect(page.getByText(body)).toBeVisible();

    // Sign out by discarding the cookies, which is what sign-out does to this
    // browser. The form goes; the comment stays.
    await context.clearCookies();
    await page.reload();

    await expect(page.getByText(body)).toBeVisible();
    await expect(page.getByLabel("Add a comment")).toHaveCount(0);
    await expect(
      page.locator("#discussion").getByRole("link", { name: "Sign in" })
    ).toBeVisible();
  });

  test("renders a script tag as text, in a real browser", async ({
    page,
    context,
  }) => {
    // The unit suite proves the parser never emits markup. This proves the
    // whole path — parser, component, React, the browser's own HTML parser —
    // agrees. If any layer between them ever starts producing HTML, the
    // injected element exists in the DOM and this fails.
    await signIn(context, session);
    await page.goto(`/products/${seeded.slug}`);

    const marker = `xss-${Date.now()}`;
    const body = `<script>window.${marker}=1</script><img src=x onerror="window.${marker}=1">`;

    await page.getByLabel("Add a comment").fill(body);
    await page.getByRole("button", { name: "Post comment" }).click();

    await expect(page.getByText(body)).toBeVisible();
    // No element was created, and nothing ran.
    expect(await page.locator("#discussion script").count()).toBe(0);
    expect(await page.locator("#discussion img").count()).toBe(0);
    expect(await page.evaluate((key) => key in window, marker)).toBe(false);
  });

  test("marks a link in a comment as untrusted user content", async ({
    page,
    context,
  }) => {
    await signIn(context, session);
    await page.goto(`/products/${seeded.slug}`);

    const body = `Their changelog is at https://example.com/changelog-${Date.now()}`;
    await page.getByLabel("Add a comment").fill(body);
    await page.getByRole("button", { name: "Post comment" }).click();

    const link = page
      .locator("#discussion a[href^='https://example.com/changelog-']")
      .first();

    await expect(link).toBeVisible();
    // nofollow and ugc, because this site does not vouch for a link a stranger
    // pasted about somebody else's product.
    await expect(link).toHaveAttribute("rel", /nofollow/);
    await expect(link).toHaveAttribute("rel", /ugc/);
    await expect(link).toHaveAttribute("rel", /noopener/);
  });

  test("refuses an empty comment with a message, not a crash", async ({
    page,
    context,
  }) => {
    await signIn(context, session);
    await page.goto(`/products/${seeded.slug}`);

    // `required` stops the browser submitting an empty field, so the case that
    // reaches the server is whitespace — which the parser rejects.
    await page.getByLabel("Add a comment").fill("   ");
    await page.getByRole("button", { name: "Post comment" }).click();

    await expect(page.getByText("Write something first.")).toBeVisible();
  });

  test("keeps the comment box usable at the viewport under test", async ({
    page,
    context,
  }) => {
    // docs/DESIGN.md §9 treats 360px as first class, and this spec runs at both
    // widths. The textarea must be fully inside the viewport, and its font must
    // be at least 16px or iOS zooms the page on focus and the form becomes
    // unusable exactly where it is hardest to recover from.
    await signIn(context, session);
    await page.goto(`/products/${seeded.slug}`);

    const box = page.getByLabel("Add a comment");
    await expect(box).toBeVisible();

    const bounds = (await box.boundingBox())!;
    const viewport = page.viewportSize()!;

    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);

    // The iOS zoom threshold applies below the `md` breakpoint, which is where
    // a phone actually is. Above it the shared Textarea drops to 14px by
    // design, and asserting 16px everywhere would be asserting a bug.
    if (viewport.width < 768) {
      const fontSize = await box.evaluate(
        (element) => Number.parseFloat(getComputedStyle(element).fontSize)
      );
      expect(fontSize).toBeGreaterThanOrEqual(16);
    }

    await expect(
      page.getByRole("button", { name: "Post comment" })
    ).toBeVisible();
  });
});
