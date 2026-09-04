// tests/e2e/waitlist-export.spec.ts
import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

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

/**
 * Fetches inside the page, not beside it.
 *
 * `context.request` is a Node-side HTTP client with its own cookie handling.
 * The session cookie is `__Host-`-prefixed in a production build and therefore
 * Secure-only, and that client does not apply the localhost exception a
 * browser does -- so every request arrived signed out, and the route answered
 * the same 404 it gives a stranger. Nothing was wrong with the endpoint.
 *
 * `page.evaluate` runs in the document, so the browser attaches cookies the
 * way it does for the founder who clicks Export.
 */
async function fetchInPage(
  page: Page,
  path: string
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
  /** The first three bytes, so the UTF-8 BOM can be asserted as bytes. */
  leadingBytes: number[];
}> {
  // Any same-origin document will do; the fetch is what is under test.
  await page.goto("/");

  return page.evaluate(async (target) => {
    const response = await fetch(target, { credentials: "include" });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Bytes, then text. `Response.text()` decodes as UTF-8 and the decoder
    // strips a leading BOM, so a string can never show whether the file
    // actually starts with one -- which is the whole of what the Excel case
    // asserts.
    const bytes = new Uint8Array(await response.clone().arrayBuffer());

    return {
      status: response.status,
      headers,
      body: await response.text(),
      leadingBytes: Array.from(bytes.slice(0, 3)),
    };
  }, path);
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
    page,
  }) => {
    const entry = await seedConfirmedEntry(seeded.id);
    await signIn(context, ownerToken);

    const response = await fetchInPage(
      page,
      `/api/products/${seeded.id}/waitlist`
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    // A file, not a page. Without this the browser renders the addresses.
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(response.headers["content-disposition"]).toContain(".csv");
    // Bulk personal data must not sit in any cache.
    expect(response.headers["cache-control"]).toContain("no-store");

    const rows = lines(response.body);

    expect(rows[0]).toBe("email,consented_at,consent_statement,confirmed_at");
    expect(rows.some((row) => row.startsWith(entry.email))).toBe(true);
  });

  test("neutralises an address a spreadsheet would evaluate", async ({
    context,
    page,
  }) => {
    // The headline risk in slice 4.2, proved end to end rather than only in the
    // unit test: the value has to survive the repository, the stream, and the
    // response body still neutralised.
    const hostile = "=1+1@example.test";
    await seedConfirmedEntry(seeded.id, hostile);
    await signIn(context, ownerToken);

    const response = await fetchInPage(
      page,
      `/api/products/${seeded.id}/waitlist`
    );
    const body = response.body;

    expect(body).toContain(`'${hostile}`);
    // And the raw value never appears at the start of a cell.
    expect(body).not.toMatch(/(^|\r\n)=1\+1@example\.test/);
  });

  test("starts with a UTF-8 byte order mark, so Excel reads it correctly", async ({
    context,
    page,
  }) => {
    await seedConfirmedEntry(seeded.id);
    await signIn(context, ownerToken);

    const response = await fetchInPage(
      page,
      `/api/products/${seeded.id}/waitlist`
    );

    // EF BB BF, asserted as bytes. Excel on Windows reads the file in the
    // system codepage without it, so a subscriber with a non-ASCII address
    // opens as mojibake -- and those addresses are the file's whole purpose.
    expect(response.leadingBytes).toEqual([0xef, 0xbb, 0xbf]);
  });

  test("refuses another owner's waitlist with a 404, not a 403", async ({
    context,
    page,
  }) => {
    // A 403 on a product somebody does not own confirms that the product
    // exists, which turns this route into a way to enumerate ids
    // (docs/SECURITY.md §3).
    await seedConfirmedEntry(seeded.id);
    await signIn(context, stranger.token);

    const response = await fetchInPage(
      page,
      `/api/products/${seeded.id}/waitlist`
    );

    expect(response.status).toBe(404);
    expect(response.body).not.toContain("@example.test");
  });

  test("refuses a signed-out request", async ({ context, page }) => {
    await seedConfirmedEntry(seeded.id);
    await context.clearCookies();

    const response = await fetchInPage(
      page,
      `/api/products/${seeded.id}/waitlist`
    );

    expect(response.status).toBe(404);
  });
});
