// tests/e2e/waitlist-export.spec.ts
import { expect, test, type BrowserContext } from "@playwright/test";

import {
  removeSeededProduct,
  seedPublishedProduct,
  type SeededProduct,
} from "./fixtures/seed-product";
import {
  removeSeededAccount,
  seedSessionFor,
  seedSignedInAccount,
  type SeededSession,
} from "./fixtures/seed-session";
import { enableWaitlist, seedConfirmedEntry } from "./fixtures/seed-waitlist";

/**
 * Exporting a waitlist, Phase 4 slice 4.2.
 *
 * The plan's E2E is "export downloads and parses". Parsing is what makes it a
 * test rather than a smoke check: a CSV that a spreadsheet opens is not the
 * same as a CSV that is correct, and the formula-injection case below is one a
 * status code would never catch.
 */

const noDatabase = !process.env.DATABASE_URL;

/** Both names, because the server under test is in production mode. */
const SESSION_COOKIE_NAMES = [
  "__Host-failproducts_session",
  "failproducts_session",
];

async function signIn(context: BrowserContext, token: string) {
  const base = new URL(
    process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100"
  );

  await context.addCookies(
    SESSION_COOKIE_NAMES.map((name) => ({
      name,
      value: token,
      domain: base.hostname,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax" as const,
    }))
  );
}

/** Splits a CSV that has no embedded newlines, stripping the UTF-8 BOM. */
function lines(body: string): string[] {
  return body.replace(/^﻿/, "").trimEnd().split("\r\n");
}

test.describe("waitlist export", () => {
  test.skip(noDatabase, "DATABASE_URL is not set — the export is a query");

  let seeded: SeededProduct;
  let ownerToken: string;
  let stranger: SeededSession;

  test.beforeAll(async () => {
    if (noDatabase) return;
    seeded = await seedPublishedProduct();
    await enableWaitlist(seeded.id);
    ownerToken = await seedSessionFor(seeded.ownerId);
    stranger = await seedSignedInAccount();
  });

  test.afterAll(async () => {
    if (noDatabase) return;
    if (stranger) await removeSeededAccount(stranger.userId);
    if (seeded) await removeSeededProduct(seeded);
  });

  test("downloads as a CSV attachment the owner can open", async ({
    context,
  }) => {
    const entry = await seedConfirmedEntry(seeded.id);
    await signIn(context, ownerToken);

    const response = await context.request.get(
      `/api/products/${seeded.id}/waitlist`
    );

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    // A file, not a page. Without this the browser renders the addresses.
    expect(response.headers()["content-disposition"]).toContain("attachment");
    expect(response.headers()["content-disposition"]).toContain(".csv");
    // Bulk personal data must not sit in any cache.
    expect(response.headers()["cache-control"]).toContain("no-store");

    const rows = lines(await response.text());

    expect(rows[0]).toBe("email,consented_at,consent_statement,confirmed_at");
    expect(rows.some((row) => row.startsWith(entry.email))).toBe(true);
  });

  test("neutralises an address a spreadsheet would evaluate", async ({
    context,
  }) => {
    // The headline risk in slice 4.2, proved end to end rather than only in the
    // unit test: the value has to survive the repository, the stream, and the
    // response body still neutralised.
    const hostile = "=1+1@example.test";
    await seedConfirmedEntry(seeded.id, hostile);
    await signIn(context, ownerToken);

    const response = await context.request.get(
      `/api/products/${seeded.id}/waitlist`
    );
    const body = await response.text();

    expect(body).toContain(`'${hostile}`);
    // And the raw value never appears at the start of a cell.
    expect(body).not.toMatch(/(^|\r\n)=1\+1@example\.test/);
  });

  test("starts with a UTF-8 byte order mark, so Excel reads it correctly", async ({
    context,
  }) => {
    await seedConfirmedEntry(seeded.id);
    await signIn(context, ownerToken);

    const response = await context.request.get(
      `/api/products/${seeded.id}/waitlist`
    );

    expect((await response.text()).startsWith("﻿")).toBe(true);
  });

  test("refuses another owner's waitlist with a 404, not a 403", async ({
    context,
  }) => {
    // A 403 on a product somebody does not own confirms that the product
    // exists, which turns this route into a way to enumerate ids
    // (docs/SECURITY.md §3).
    await seedConfirmedEntry(seeded.id);
    await signIn(context, stranger.token);

    const response = await context.request.get(
      `/api/products/${seeded.id}/waitlist`
    );

    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain("@example.test");
  });

  test("refuses a signed-out request", async ({ context }) => {
    await seedConfirmedEntry(seeded.id);
    await context.clearCookies();

    const response = await context.request.get(
      `/api/products/${seeded.id}/waitlist`
    );

    expect(response.status()).toBe(404);
  });
});
