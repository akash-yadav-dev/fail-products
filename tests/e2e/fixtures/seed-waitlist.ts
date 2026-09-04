// tests/e2e/fixtures/seed-waitlist.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, count, eq } from "drizzle-orm";

import * as schema from "@/db/schema";
import { products, waitlistEntries } from "@/db/schema";
import { generateSessionToken, sha256Base64Url } from "@/lib/auth/crypto";
import { WAITLIST_CONSENT_STATEMENT } from "@/domain/waitlist/signup";

/**
 * Waitlist fixtures for the browser tests.
 *
 * Two things here cannot be done through the UI, which is why they are here.
 *
 * The **confirmation token** only ever exists in an email. A browser test has
 * no mailbox, so an entry is written directly with a token this process chose —
 * and only its SHA-256 reaches the table, exactly as the application stores it.
 * That is also what makes the confirm and unsubscribe specs a real check: a
 * fixture that stored the raw token would pass against a broken implementation.
 *
 * The **row count** is the only way to prove "joining twice does not
 * duplicate". The page shows the same message either way — deliberately, so the
 * form is not an oracle for who has subscribed — so the assertion has to look
 * at the table.
 */

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

/** Turns a seeded product's waitlist on. */
export async function enableWaitlist(productId: string): Promise<void> {
  await db()
    .update(products)
    .set({ waitlistEnabled: true })
    .where(eq(products.id, productId));
}

export type SeededWaitlistEntry = {
  id: string;
  email: string;
  /** The raw value the link carries. Never stored. */
  token: string;
};

/** A pending entry with a token this process knows. */
export async function seedPendingEntry(
  productId: string
): Promise<SeededWaitlistEntry> {
  const token = generateSessionToken();
  const email = `${unique("e2ewl")}@example.test`;

  const [row] = await db()
    .insert(waitlistEntries)
    .values({
      productId,
      email,
      status: "PENDING",
      consentedAt: new Date(),
      consentStatement: WAITLIST_CONSENT_STATEMENT,
      confirmationTokenHash: await sha256Base64Url(token),
    })
    .returning({ id: waitlistEntries.id });

  return { id: row!.id, email, token };
}

/**
 * A confirmed entry, written directly.
 *
 * The export only ever sees confirmed rows, and confirming through the UI for
 * each fixture row would be three page loads to set one column. `email` is a
 * parameter so a test can seed an address that a spreadsheet would evaluate.
 */
export async function seedConfirmedEntry(
  productId: string,
  email = `${unique("e2econf")}@example.test`
): Promise<{ id: string; email: string }> {
  const [row] = await db()
    .insert(waitlistEntries)
    .values({
      productId,
      email,
      status: "CONFIRMED",
      consentedAt: new Date(),
      consentStatement: WAITLIST_CONSENT_STATEMENT,
      confirmedAt: new Date(),
      confirmationTokenHash: null,
    })
    .returning({ id: waitlistEntries.id });

  return { id: row!.id, email };
}

/** How many entries a product holds, in any state. */
export async function countEntries(
  productId: string,
  email?: string
): Promise<number> {
  const [row] = await db()
    .select({ total: count() })
    .from(waitlistEntries)
    .where(
      email
        ? and(
            eq(waitlistEntries.productId, productId),
            eq(waitlistEntries.email, email)
          )
        : eq(waitlistEntries.productId, productId)
    );

  return row?.total ?? 0;
}

/** Unique per call, so the two viewport projects never share an address. */
export function unique(prefix: string) {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * A fresh address for a signup test.
 *
 * `RATE_LIMITS.waitlistJoinEmail` allows three per address per hour and counts
 * them in the real table, so a shared address would make the suite fail on its
 * second run rather than its first.
 */
export function waitlistAddress(): string {
  return `${unique("e2ejoin")}@example.test`;
}
