// src/repositories/waitlist-repository.ts
import { and, asc, count, eq, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { publiclyVisibleProduct } from "@/db/queries/product-visibility";
import { products, waitlistEntries, waitlistExports } from "@/db/schema";

/**
 * Waitlist persistence.
 *
 * Two properties shape this file.
 *
 * **The join is an upsert, not a read-then-write.** `neon-http` issues each
 * query as its own HTTP request and cannot hold an interactive transaction —
 * verified in `product-repository.ts`, where `db.transaction()` throws "No
 * transactions support in neon-http driver". So "does this address already
 * exist, and insert it if not" cannot be two statements: two visitors
 * submitting the same address at the same moment would both read "no" and both
 * insert, and the unique index would turn one of them into an error page. One
 * `INSERT … ON CONFLICT DO UPDATE` is atomic on its own, which is what makes a
 * duplicate signup idempotent rather than a race.
 *
 * **A read of a product goes through the shared visibility predicate.** A
 * waitlist on a draft, hidden, or removed listing is a collection point on a
 * page nobody may open.
 */

/** One page of the export, derived from the query rather than restated. */
export type WaitlistExportPage = Awaited<
  ReturnType<WaitlistRepository["listConfirmedForExport"]>
>;

export class WaitlistRepository {
  constructor(private readonly db: Database) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /**
   * The product a visitor may join the waitlist of, or null.
   *
   * Both halves are SQL filters rather than post-fetch checks: the listing has
   * to be publicly visible **and** the owner has to have the waitlist switched
   * on. A `product_id` in a form body is an assertion by the caller, and
   * checking it here means no service can forget to.
   *
   * The two reasons collapse into one null on purpose. "That listing does not
   * exist" and "that listing exists but its waitlist is off" are answered
   * identically by the caller, so a join form cannot be used to probe for draft
   * listings (`docs/SECURITY.md` §3).
   */
  async findJoinableProduct(productId: string) {
    const [row] = await this.db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        ownerId: products.ownerId,
      })
      .from(products)
      .where(
        and(
          eq(products.id, productId),
          eq(products.waitlistEnabled, true),
          publiclyVisibleProduct
        )
      )
      .limit(1);

    return row ?? null;
  }

  /**
   * One page of a product's confirmed entries, for the export.
   *
   * Keyset on `(created_at, id)`, not offset. The export streams, so the pages
   * are fetched while the response is already going out, and an offset would
   * re-scan every row it had already sent and shift under a concurrent signup —
   * which on an export means a duplicated or a silently dropped subscriber.
   *
   * **CONFIRMED only.** A pending entry is an address that has not answered the
   * confirmation email, so there is no evidence the person behind it asked for
   * anything (ADR-029). Exporting it would hand a founder a list they must not
   * write to, labelled as one they may.
   */
  listConfirmedForExport(
    productId: string,
    options: { limit: number; after?: { createdAt: Date; id: string } | null }
  ) {
    return this.db
      .select({
        id: waitlistEntries.id,
        email: waitlistEntries.email,
        consentedAt: waitlistEntries.consentedAt,
        consentStatement: waitlistEntries.consentStatement,
        confirmedAt: waitlistEntries.confirmedAt,
        createdAt: waitlistEntries.createdAt,
      })
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.productId, productId),
          eq(waitlistEntries.status, "CONFIRMED"),
          options.after
            ? sql`(${waitlistEntries.createdAt}, ${waitlistEntries.id}) > (${options.after.createdAt}, ${options.after.id})`
            : undefined
        )
      )
      .orderBy(asc(waitlistEntries.createdAt), asc(waitlistEntries.id))
      .limit(options.limit);
  }

  /** How many confirmed subscribers a product has. Drives the dashboard number. */
  async countConfirmed(productId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.productId, productId),
          eq(waitlistEntries.status, "CONFIRMED")
        )
      );

    return row?.total ?? 0;
  }

  /**
   * The entry a confirmation or unsubscribe link points at.
   *
   * Looked up by the **hash** of the token in the link, never by an id the
   * caller supplies: the token is the only thing proving the person holding the
   * link controls the mailbox.
   */
  async findByConfirmationToken(tokenHash: string) {
    const [row] = await this.db
      .select({
        id: waitlistEntries.id,
        productId: waitlistEntries.productId,
        email: waitlistEntries.email,
        status: waitlistEntries.status,
        productSlug: products.slug,
        productName: products.name,
      })
      .from(waitlistEntries)
      .innerJoin(products, eq(waitlistEntries.productId, products.id))
      .where(eq(waitlistEntries.confirmationTokenHash, tokenHash))
      .limit(1);

    return row ?? null;
  }

  /**
   * Confirmed subscriber counts for every product one account owns.
   *
   * One query for the whole dashboard list, not one per row. A count issued per
   * product is the N+1 `docs/ENGINEERING.md` §5 forbids, and it is the shape
   * that looks harmless with three listings and is a page-load with thirty.
   *
   * Returns only products that have at least one confirmed entry — the caller
   * reads a missing key as zero, which is cheaper than joining every listing to
   * a table most of them have no rows in.
   */
  async countConfirmedByOwner(ownerId: string) {
    return this.db
      .select({
        productId: waitlistEntries.productId,
        total: count(),
      })
      .from(waitlistEntries)
      .innerJoin(products, eq(waitlistEntries.productId, products.id))
      .where(
        and(
          eq(products.ownerId, ownerId),
          eq(waitlistEntries.status, "CONFIRMED")
        )
      )
      .groupBy(waitlistEntries.productId);
  }

  /**
   * The product an entry belongs to, by entry id.
   *
   * Needed after a confirmation, because confirming burns the token — so the
   * page that says "you are on the list for X" can no longer find the row the
   * way the link did.
   */
  async findProductForEntry(entryId: string) {
    const [row] = await this.db
      .select({ slug: products.slug, name: products.name })
      .from(waitlistEntries)
      .innerJoin(products, eq(waitlistEntries.productId, products.id))
      .where(eq(waitlistEntries.id, entryId))
      .limit(1);

    return row ?? null;
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * Records a signup, or refreshes the one that already exists.
   *
   * One statement. The `ON CONFLICT` arm is what makes joining twice a no-op
   * from the visitor's point of view, and it is deliberately narrow: it renews
   * the confirmation token and re-stamps consent for an entry that is still
   * PENDING, and **leaves a CONFIRMED entry completely alone**. Re-issuing a
   * token for a confirmed subscriber would let anyone who knows an address put
   * that subscription back into an unconfirmed state by submitting the form,
   * which is a denial of service against somebody else's mailbox.
   *
   * `created` distinguishes the two for the caller, which is the only thing
   * that decides whether an email is worth sending. The visitor is told the
   * same thing either way — see the service.
   */
  async upsertPendingEntry(input: {
    productId: string;
    email: string;
    consentedAt: Date;
    consentStatement: string;
    confirmationTokenHash: string;
  }) {
    const [row] = await this.db
      .insert(waitlistEntries)
      .values({
        productId: input.productId,
        email: input.email,
        status: "PENDING",
        consentedAt: input.consentedAt,
        consentStatement: input.consentStatement,
        confirmationTokenHash: input.confirmationTokenHash,
      })
      .onConflictDoUpdate({
        target: [waitlistEntries.productId, waitlistEntries.email],
        set: {
          consentedAt: input.consentedAt,
          consentStatement: input.consentStatement,
          confirmationTokenHash: input.confirmationTokenHash,
          updatedAt: new Date(),
        },
        // Only while it is still pending. A confirmed subscription is not
        // reopened by somebody re-typing the address into the form.
        setWhere: eq(waitlistEntries.status, "PENDING"),
      })
      .returning({
        id: waitlistEntries.id,
        status: waitlistEntries.status,
        createdAt: waitlistEntries.createdAt,
        updatedAt: waitlistEntries.updatedAt,
      });

    // No row comes back when the conflict arm's predicate excluded it — the
    // address is already confirmed, and there is nothing to do.
    if (!row) return { entry: null, created: false, alreadyConfirmed: true };

    return {
      entry: row,
      // A row Postgres has just inserted has identical timestamps; one it
      // updated does not. There is no other signal available from a single
      // statement, and asking a second time would reintroduce the race the
      // upsert exists to remove.
      created: row.createdAt.getTime() === row.updatedAt.getTime(),
      alreadyConfirmed: false,
    };
  }

  /**
   * Marks an entry confirmed and burns its token.
   *
   * Guarded on the status so a link followed twice — by a person, or by a mail
   * client prefetching it — confirms once. The second call matches no row and
   * returns null, which the service reads as "already confirmed" rather than as
   * an error, because to the subscriber both are the same outcome.
   */
  async confirmEntry(tokenHash: string, now: Date) {
    const [row] = await this.db
      .update(waitlistEntries)
      .set({
        status: "CONFIRMED",
        confirmedAt: now,
        // Single-use. Kept null afterwards so the table holds no live
        // credential for a subscription that is already settled.
        confirmationTokenHash: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(waitlistEntries.confirmationTokenHash, tokenHash),
          eq(waitlistEntries.status, "PENDING")
        )
      )
      .returning({
        id: waitlistEntries.id,
        productId: waitlistEntries.productId,
        email: waitlistEntries.email,
      });

    return row ?? null;
  }

  /**
   * Erases an entry.
   *
   * A delete, not a flag. `docs/LEGAL.md` §5: a waitlist entry is erased on
   * request by the subscriber, and "a soft-deleted row that still contains
   * personal data has not been deleted".
   */
  async deleteByConfirmationToken(tokenHash: string): Promise<boolean> {
    const rows = await this.db
      .delete(waitlistEntries)
      .where(eq(waitlistEntries.confirmationTokenHash, tokenHash))
      .returning({ id: waitlistEntries.id });

    return rows.length > 0;
  }

  /** Erases an entry by address, for a request that arrives any other way. */
  async deleteByEmail(productId: string, email: string): Promise<boolean> {
    const rows = await this.db
      .delete(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.productId, productId),
          eq(waitlistEntries.email, email)
        )
      )
      .returning({ id: waitlistEntries.id });

    return rows.length > 0;
  }

  /** Records that a subscriber list was downloaded (`docs/SECURITY.md` §11). */
  async recordExport(input: {
    productId: string;
    actorId: string;
    rowCount: number;
  }) {
    await this.db.insert(waitlistExports).values(input);
  }
}

/**
 * How many entries one round trip of the export fetches.
 *
 * Kept next to the query it bounds. Large enough that a realistic list is one
 * or two round trips, small enough that no single response ever holds the whole
 * table in memory — which is the point of streaming it.
 */
export const WAITLIST_EXPORT_PAGE_SIZE = 500;
