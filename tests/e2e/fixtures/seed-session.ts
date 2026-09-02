// tests/e2e/fixtures/seed-session.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";

import * as schema from "@/db/schema";
import { sessions, users } from "@/db/schema";
import {
  generateSessionToken,
  sha256Base64Url,
} from "@/lib/auth/crypto";

/**
 * A real signed-in browser, for the flows that need one.
 *
 * The Phase 3 plan's E2E for comments is "post a comment, see it, sign out,
 * confirm the form is gone but the comment remains readable". None of that can
 * be faked: the composer, the Server Action, the rate limiter, and the
 * visibility filter all have to agree about a session that actually exists.
 *
 * The session row is written **directly**, not through an endpoint. The
 * alternative would be a route that mints a session for an arbitrary account —
 * a piece of production surface that exists only for tests, gated by an
 * environment variable, and catastrophic the one time the gate is wrong. The
 * fixture already has the database; nothing is gained by asking the application
 * to do this and something real is risked.
 *
 * The token itself is generated the same way the application generates one, and
 * only its SHA-256 reaches the table — which is also what makes this a check on
 * `getSessionUser`: a fixture that stored the raw token would pass against a
 * broken implementation.
 */

export type SeededSession = {
  userId: string;
  username: string;
  /** The raw value for the session cookie. Never stored anywhere. */
  token: string;
};

/** The role a seeded account holds. Granted here the way it is granted in
 * production: by writing the column, because nothing in the application
 * changes it. */
export type SeededRole = "MEMBER" | "MODERATOR";

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

function unique(prefix: string) {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

/** Creates an account and a live session for it. */
export async function seedSignedInAccount(
  role: SeededRole = "MEMBER"
): Promise<SeededSession> {
  const database = db();
  const handle = unique("e2euser");

  const [account] = await database
    .insert(users)
    .values({
      username: handle,
      usernameLower: handle.toLowerCase(),
      email: `${handle}@example.test`,
      displayName: `Test ${handle}`,
      role,
    })
    .returning();

  const token = generateSessionToken();
  await database.insert(sessions).values({
    userId: account!.id,
    tokenHash: await sha256Base64Url(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    lastSeenAt: new Date(),
  });

  return { userId: account!.id, username: handle, token };
}

/** Creates a live session for an account that already exists. */
export async function seedSessionFor(userId: string): Promise<string> {
  const token = generateSessionToken();
  await db()
    .insert(sessions)
    .values({
      userId,
      tokenHash: await sha256Base64Url(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastSeenAt: new Date(),
    });

  return token;
}

export async function removeSeededAccount(userId: string) {
  // Sessions cascade. Comments and products do not: both are ON DELETE SET
  // NULL, so they survive as anonymous records — which is the behaviour
  // docs/LEGAL.md §5 specifies, and not something a test should undo.
  await db().delete(users).where(eq(users.id, userId));
}
