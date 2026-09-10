// tests/integration/waitlist.test.ts
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { products, users, waitlistEntries, waitlistExports } from "@/db/schema";
import { WAITLIST_CONSENT_STATEMENT } from "@/domain/waitlist/signup";
import { ProductRepository } from "@/repositories/product-repository";
import { RateLimitRepository } from "@/repositories/rate-limit-repository";
import { WaitlistRepository } from "@/repositories/waitlist-repository";
import { setWaitlistEnabled } from "@/services/product/product-service";
import { DatabaseRateLimiter } from "@/services/security/rate-limit";
import {
  confirmWaitlistEntry,
  exportWaitlistCsv,
  joinWaitlist,
  unsubscribeFromWaitlist,
  type WaitlistConfirmationMessage,
} from "@/services/waitlist/waitlist-service";
import { noDatabase, testDb, unique } from "./database";

/**
 * The waitlist (Phase 4 slices 4.1 and 4.2).
 *
 * The rules asserted here are the ones the Phase 4 exit gate names: consent is
 * recorded with a timestamp, a duplicate signup does not duplicate, an entry is
 * deletable on request, a provider failure does not fail the visitor's request,
 * and an owner cannot export somebody else's list.
 */

describe.skipIf(noDatabase)("waitlist", () => {
  const db = noDatabase ? null : testDb();
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];

  function deps() {
    return {
      repository: new WaitlistRepository(db!),
      products: new ProductRepository(db!),
      rateLimiter: new DatabaseRateLimiter(new RateLimitRepository(db!)),
    };
  }

  /**
   * A dispatcher a test can wait on.
   *
   * The production dispatcher hands the send to Next's `after()`, which runs it
   * once the response has gone out. A test has no response to wait for, so it
   * captures the promise instead — which is the whole reason the seam exists,
   * and what lets these tests assert on delivery without blocking the join on
   * it.
   */
  function capturingDispatch() {
    const settled: Promise<unknown>[] = [];

    return {
      dispatch: (send: () => Promise<void>) => {
        settled.push(send().catch((error: unknown) => error));
      },
      /** Resolves once every dispatched send has finished, however it finished. */
      drain: () => Promise.all(settled),
      get count() {
        return settled.length;
      },
    };
  }

  async function account() {
    const handle = unique("wl");
    const [row] = await db!
      .insert(users)
      .values({
        username: handle,
        usernameLower: handle.toLowerCase(),
        email: `${handle}@example.test`,
      })
      .returning();

    createdUserIds.push(row!.id);
    return row!.id;
  }

  async function product(
    state: Partial<typeof products.$inferInsert> = {}
  ) {
    const [row] = await db!
      .insert(products)
      .values({
        ownerId: await account(),
        slug: unique("wl-fixture"),
        name: "Waitlist fixture",
        failureStatus: "ABANDONED",
        publicationState: "PUBLISHED",
        moderationState: "NONE",
        publishedAt: new Date(),
        waitlistEnabled: true,
        ...state,
      })
      .returning();

    createdProductIds.push(row!.id);
    return row!;
  }

  /**
   * A fresh address, per test.
   *
   * Not a shared constant, and the reason is the limiter rather than tidiness:
   * `RATE_LIMITS.waitlistJoinEmail` allows three signups per address per hour,
   * counted in the real `rate_limits` table. A shared address makes the fourth
   * test in the file fail — and then makes the first one fail on the next run,
   * an hour of confusion for a limit that is behaving exactly as specified.
   * One address per test is also what the testing contract asks for: no shared
   * mutable state, because a shared row makes a failure unreproducible.
   */
  function address(prefix = "reader") {
    return `${unique(prefix)}@example.test`;
  }

  /** A signup that always succeeds at delivery, with the token captured. */
  function recordingSender() {
    const sent: WaitlistConfirmationMessage[] = [];
    return {
      sent,
      send: async (message: WaitlistConfirmationMessage) => {
        sent.push(message);
      },
    };
  }

  afterAll(async () => {
    if (!db) return;
    if (createdProductIds.length) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  // -------------------------------------------------------------------------
  // Consent
  // -------------------------------------------------------------------------

  it("writes the consent record with a timestamp", async () => {
    // The Phase 4 exit gate's first item. docs/LEGAL.md §5 files this data as
    // consent-based, so an entry with no timestamped consent is an address the
    // site has no basis to write to.
    const listing = await product();
    const subscriber = address();
    const sender = recordingSender();
    const before = Date.now();

    await joinWaitlist({
      ...deps(),
      productId: listing.id,
      // Padded and upper-cased, so the normalisation is exercised by the same
      // test that pins the consent record.
      email: `  ${subscriber.toUpperCase()} `,
      consent: "on",
      sendConfirmation: sender.send,
      dispatch: capturingDispatch().dispatch,
    });

    const [row] = await db!
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.productId, listing.id));

    expect(row).toBeDefined();
    // Normalised on the way in, so one mailbox is one row.
    expect(row!.email).toBe(subscriber);
    expect(row!.consentedAt).toBeInstanceOf(Date);
    expect(row!.consentedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    // Stored verbatim. A pointer at a document that has since changed is not
    // evidence of what anybody agreed to.
    expect(row!.consentStatement).toBe(WAITLIST_CONSENT_STATEMENT);
  });

  it("refuses to store an address with no consent", async () => {
    const subscriber = address();
    const listing = await product();

    await expect(
      joinWaitlist({
        ...deps(),
        productId: listing.id,
        email: subscriber,
        consent: undefined,
        sendConfirmation: recordingSender().send,
      })
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });

    const rows = await db!
      .select({ id: waitlistEntries.id })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.productId, listing.id));
    expect(rows).toHaveLength(0);
  });

  it("starts an entry unconfirmed, so nothing may be sent to it yet", async () => {
    const subscriber = address();
    // ADR-028. The row exists; the address is not yet mailable.
    const listing = await product();

    await joinWaitlist({
      ...deps(),
      productId: listing.id,
      email: subscriber,
      consent: "on",
      sendConfirmation: recordingSender().send,
      dispatch: capturingDispatch().dispatch,
    });

    const [row] = await db!
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.productId, listing.id));

    expect(row!.status).toBe("PENDING");
    expect(row!.confirmedAt).toBeNull();
    expect(row!.confirmationTokenHash).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Duplicates
  // -------------------------------------------------------------------------

  it("does not duplicate a row when the same address joins twice", async () => {
    const subscriber = address();
    const listing = await product();
    const sender = recordingSender();
    const mail = capturingDispatch();

    await joinWaitlist({
      ...deps(),
      productId: listing.id,
      email: subscriber,
      consent: "on",
      sendConfirmation: sender.send,
      dispatch: mail.dispatch,
    });
    await joinWaitlist({
      ...deps(),
      productId: listing.id,
      email: subscriber.toUpperCase(),
      consent: "on",
      sendConfirmation: sender.send,
      dispatch: mail.dispatch,
    });

    await mail.drain();

    const rows = await db!
      .select({ id: waitlistEntries.id })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.productId, listing.id));

    // One row, even though the second submission used a different casing.
    expect(rows).toHaveLength(1);
  });

  it("keeps two products' lists apart for the same address", async () => {
    const subscriber = address();
    // The unique index is on (product_id, email), not email. One person may be
    // waiting on two comebacks.
    const first = await product();
    const second = await product();
    const dispatch = capturingDispatch().dispatch;

    for (const listing of [first, second]) {
      await joinWaitlist({
        ...deps(),
        productId: listing.id,
        email: subscriber,
        consent: "on",
        sendConfirmation: recordingSender().send,
        dispatch,
      });
    }

    const rows = await db!
      .select({ productId: waitlistEntries.productId })
      .from(waitlistEntries)
      .where(inArray(waitlistEntries.productId, [first.id, second.id]));

    expect(rows).toHaveLength(2);
  });

  it("does not reopen a confirmed subscription when the form is submitted again", async () => {
    const subscriber = address();
    // Otherwise anybody who knows an address could push that subscription back
    // into an unconfirmed state, which is a denial of service on somebody
    // else's mailbox — and a second confirmation email they did not ask for.
    const listing = await product();
    const sender = recordingSender();
    const mail = capturingDispatch();

    await joinWaitlist({
      ...deps(),
      productId: listing.id,
      email: subscriber,
      consent: "on",
      sendConfirmation: sender.send,
      dispatch: mail.dispatch,
    });
    await mail.drain();

    await confirmWaitlistEntry({
      repository: deps().repository,
      token: sender.sent[0]!.token,
    });

    const second = capturingDispatch();
    await joinWaitlist({
      ...deps(),
      productId: listing.id,
      email: subscriber,
      consent: "on",
      sendConfirmation: sender.send,
      dispatch: second.dispatch,
    });
    await second.drain();

    const [row] = await db!
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.productId, listing.id));

    expect(row!.status).toBe("CONFIRMED");
    expect(row!.confirmationTokenHash).toBeNull();
    // And no second email went out.
    expect(second.count).toBe(0);
    expect(sender.sent).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Delivery
  // -------------------------------------------------------------------------

  it("does not fail the visitor's request when the email provider errors", async () => {
    const subscriber = address();
    // docs/ENGINEERING.md §9. A ZeptoMail outage must not turn a successful
    // signup into an error page, and the row must still be there afterwards.
    const listing = await product();
    const mail = capturingDispatch();

    const outcome = await joinWaitlist({
      ...deps(),
      productId: listing.id,
      email: subscriber,
      consent: "on",
      sendConfirmation: async () => {
        throw new Error("zeptomail-http-503");
      },
      dispatch: mail.dispatch,
    });

    expect(outcome.accepted).toBe(true);

    // The send was attempted and it failed. Neither fact reached the caller.
    const results = await mail.drain();
    expect(results[0]).toBeInstanceOf(Error);

    const rows = await db!
      .select({ status: waitlistEntries.status })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.productId, listing.id));

    // Still pending, which is the correct outcome for an address that could
    // not be reached: nothing will ever be sent to it.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("PENDING");
  });

  it("sends the confirmation with the token that confirms the entry", async () => {
    const subscriber = address();
    const listing = await product();
    const sender = recordingSender();
    const mail = capturingDispatch();

    await joinWaitlist({
      ...deps(),
      productId: listing.id,
      email: subscriber,
      consent: "on",
      sendConfirmation: sender.send,
      dispatch: mail.dispatch,
    });
    await mail.drain();

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({
      email: subscriber,
      productSlug: listing.slug,
    });

    const confirmed = await confirmWaitlistEntry({
      repository: deps().repository,
      token: sender.sent[0]!.token,
    });

    expect(confirmed.kind).toBe("confirmed");
  });

  // -------------------------------------------------------------------------
  // Confirmation
  // -------------------------------------------------------------------------

  it("confirms once, and reports a second visit as already confirmed", async () => {
    const subscriber = address();
    // Mail clients prefetch links. The second visit must not read as an error.
    const listing = await product();
    const sender = recordingSender();
    const mail = capturingDispatch();

    await joinWaitlist({
      ...deps(),
      productId: listing.id,
      email: subscriber,
      consent: "on",
      sendConfirmation: sender.send,
      dispatch: mail.dispatch,
    });
    await mail.drain();

    const token = sender.sent[0]!.token;
    const first = await confirmWaitlistEntry({
      repository: deps().repository,
      token,
    });
    const second = await confirmWaitlistEntry({
      repository: deps().repository,
      token,
    });

    expect(first.kind).toBe("confirmed");
    // The token is burned on confirmation, so the second visit finds nothing
    // and is reported as unknown rather than as a failure the visitor caused.
    expect(second.kind).toBe("unknown");

    const [row] = await db!
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.productId, listing.id));
    expect(row!.status).toBe("CONFIRMED");
    expect(row!.confirmedAt).toBeInstanceOf(Date);
    expect(row!.confirmationTokenHash).toBeNull();
  });

  it("treats an unknown token as unknown rather than as an error", async () => {
    expect(
      await confirmWaitlistEntry({
        repository: deps().repository,
        token: "not-a-real-token",
      })
    ).toEqual({ kind: "unknown" });
  });

  // -------------------------------------------------------------------------
  // Erasure
  // -------------------------------------------------------------------------

  it("erases an entry on request, leaving no row behind", async () => {
    const subscriber = address();
    // docs/LEGAL.md §5: erased, not flagged. A soft-deleted row that still
    // holds an email address has not been deleted.
    const listing = await product();
    const sender = recordingSender();
    const mail = capturingDispatch();

    await joinWaitlist({
      ...deps(),
      productId: listing.id,
      email: subscriber,
      consent: "on",
      sendConfirmation: sender.send,
      dispatch: mail.dispatch,
    });
    await mail.drain();

    await unsubscribeFromWaitlist({
      repository: deps().repository,
      token: sender.sent[0]!.token,
    });

    const rows = await db!
      .select({ id: waitlistEntries.id })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.productId, listing.id));

    expect(rows).toHaveLength(0);
  });

  it("erases every entry when the product is deleted", async () => {
    const subscriber = address();
    // The other half of the retention rule: an entry is held "until product
    // deletion or unsubscribe". The cascade is what makes the first half true.
    const listing = await product();
    const mail = capturingDispatch();

    await joinWaitlist({
      ...deps(),
      productId: listing.id,
      email: subscriber,
      consent: "on",
      sendConfirmation: recordingSender().send,
      dispatch: mail.dispatch,
    });
    await mail.drain();

    await db!.delete(products).where(eq(products.id, listing.id));

    const rows = await db!
      .select({ id: waitlistEntries.id })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.productId, listing.id));

    expect(rows).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // The owner's switch
  // -------------------------------------------------------------------------

  it("refuses a signup when the owner has not switched the waitlist on", async () => {
    const subscriber = address();
    const listing = await product({ waitlistEnabled: false });

    await expect(
      joinWaitlist({
        ...deps(),
        productId: listing.id,
        email: subscriber,
        consent: "on",
        sendConfirmation: recordingSender().send,
      })
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("refuses a signup on a listing that is not publicly visible", async () => {
    const subscriber = address();
    // A waitlist on a draft or hidden listing would be a collection point on a
    // page nobody may open. The same answer as an unknown id, so the form
    // cannot be used to probe for draft listings.
    const draft = await product({
      publicationState: "DRAFT",
      publishedAt: null,
    });
    const hidden = await product({ moderationState: "HIDDEN" });

    for (const listing of [draft, hidden]) {
      await expect(
        joinWaitlist({
          ...deps(),
          productId: listing.id,
          email: subscriber,
          consent: "on",
          sendConfirmation: recordingSender().send,
        })
      ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
    }
  });

  it("keeps existing addresses when the owner switches the waitlist off", async () => {
    const subscriber = address();
    // The switch stops new signups. Erasing a founder's list on a misclick
    // would destroy data whose consent nobody withdrew.
    const listing = await product();
    const mail = capturingDispatch();

    await joinWaitlist({
      ...deps(),
      productId: listing.id,
      email: subscriber,
      consent: "on",
      sendConfirmation: recordingSender().send,
      dispatch: mail.dispatch,
    });
    await mail.drain();

    await setWaitlistEnabled({
      repository: deps().products,
      viewer: { userId: listing.ownerId },
      productId: listing.id,
      enabled: false,
    });

    const rows = await db!
      .select({ id: waitlistEntries.id })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.productId, listing.id));

    expect(rows).toHaveLength(1);
  });

  it("refuses the switch to anybody but the owner", async () => {
    const listing = await product();

    await expect(
      setWaitlistEnabled({
        repository: deps().products,
        viewer: { userId: await account() },
        productId: listing.id,
        enabled: true,
      })
    ).rejects.toThrow("Not found");
  });

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  /** Joins, confirms, and returns the addresses now on the list. */
  async function seedConfirmed(productId: string, emails: string[]) {
    const sender = recordingSender();
    const mail = capturingDispatch();

    for (const email of emails) {
      await joinWaitlist({
        ...deps(),
        productId,
        email,
        consent: "on",
        sendConfirmation: sender.send,
        dispatch: mail.dispatch,
      });
    }
    await mail.drain();

    for (const message of sender.sent) {
      await confirmWaitlistEntry({
        repository: deps().repository,
        token: message.token,
      });
    }
  }

  async function collect(rows: AsyncGenerator<string>) {
    let out = "";
    for await (const chunk of rows) out += chunk;
    return out;
  }

  it("refuses to export another owner's waitlist", async () => {
    const subscriber = address();
    // The headline authorization rule for slice 4.2, and the reason the check
    // re-loads the product rather than trusting anything from the request.
    const listing = await product();
    await seedConfirmed(listing.id, [subscriber]);

    await expect(
      exportWaitlistCsv({
        ...deps(),
        viewer: { userId: await account() },
        productId: listing.id,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to export to a signed-out caller", async () => {
    const listing = await product();

    await expect(
      exportWaitlistCsv({
        ...deps(),
        viewer: { userId: null },
        productId: listing.id,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to export to a moderator who does not own the listing", async () => {
    // docs/SECURITY.md §11 and docs/LEGAL.md §5: subscribers consented to hear
    // from this founder. Moderation is a content power, not a reason to hold a
    // list of strangers' addresses.
    const listing = await product();

    await expect(
      exportWaitlistCsv({
        ...deps(),
        viewer: { userId: await account(), isModerator: true },
        productId: listing.id,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("gives the same answer for a product that does not exist", async () => {
    // An authorization failure distinguishable from a missing record is a way
    // to enumerate which product ids are real.
    await expect(
      exportWaitlistCsv({
        ...deps(),
        viewer: { userId: await account() },
        productId: "00000000-0000-7000-8000-000000000000",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("exports the owner's own confirmed subscribers, with a header row", async () => {
    const first = address("first");
    const second = address("second");
    const listing = await product();
    await seedConfirmed(listing.id, [
      first,
      second,
    ]);

    const exported = await exportWaitlistCsv({
      ...deps(),
      viewer: { userId: listing.ownerId },
      productId: listing.id,
    });

    const csv = await collect(exported.rows());
    const lines = csv.trimEnd().split("\r\n");

    expect(lines[0]).toBe("email,consented_at,consent_statement,confirmed_at");
    expect(lines).toHaveLength(3);
    expect(csv).toContain(first);
    expect(csv).toContain(second);
  });

  it("leaves unconfirmed addresses out of the export", async () => {
    const confirmedAddress = address("confirmed");
    const pendingAddress = address("pending");
    // An address that never answered the confirmation is one the founder must
    // not write to. Handing it over labelled as a subscriber is the failure
    // double opt-in exists to prevent (ADR-028).
    const listing = await product();
    const mail = capturingDispatch();

    await seedConfirmed(listing.id, [confirmedAddress]);
    await joinWaitlist({
      ...deps(),
      productId: listing.id,
      email: pendingAddress,
      consent: "on",
      sendConfirmation: recordingSender().send,
      dispatch: mail.dispatch,
    });
    await mail.drain();

    const exported = await exportWaitlistCsv({
      ...deps(),
      viewer: { userId: listing.ownerId },
      productId: listing.id,
    });
    const csv = await collect(exported.rows());

    expect(csv).toContain(confirmedAddress);
    expect(csv).not.toContain(pendingAddress);
  });

  it("exports a header and nothing else when the list is empty", async () => {
    // The case every founder sees first. It must be a valid file, not an error.
    const listing = await product();

    const exported = await exportWaitlistCsv({
      ...deps(),
      viewer: { userId: listing.ownerId },
      productId: listing.id,
    });

    expect(await collect(exported.rows())).toBe(
      "email,consented_at,consent_statement,confirmed_at\r\n"
    );
  });

  it("records the export in the audit table once the last row is written", async () => {
    const subscriber = address();
    // docs/SECURITY.md §11 requires this endpoint to be audit-logged as well
    // as rate-limited: it is the one request that hands over bulk personal
    // data, and "who took the list" is the question asked afterwards.
    const listing = await product();
    await seedConfirmed(listing.id, [subscriber]);

    const waitlist = new WaitlistRepository(db!);
    const exported = await exportWaitlistCsv({
      ...deps(),
      repository: waitlist,
      viewer: { userId: listing.ownerId },
      productId: listing.id,
      onComplete: ({ rowCount }) =>
        waitlist.recordExport({
          productId: listing.id,
          actorId: listing.ownerId!,
          rowCount,
        }),
    });

    await collect(exported.rows());

    const [row] = await db!
      .select()
      .from(waitlistExports)
      .where(eq(waitlistExports.productId, listing.id));

    expect(row).toBeDefined();
    expect(row!.rowCount).toBe(1);
    expect(row!.actorId).toBe(listing.ownerId);
  });
});
