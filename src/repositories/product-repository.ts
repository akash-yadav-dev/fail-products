// src/repositories/product-repository.ts
import { and, desc, eq, lt, or, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { publiclyVisibleProduct } from "@/db/queries/product-visibility";
import {
  productSlugHistory,
  productStatusHistory,
  products,
  users,
} from "@/db/schema";
import type { FailureStatus } from "@/domain/product/failure-status";
import type {
  ModerationState,
  PublicationState,
  StatusAxis,
} from "@/domain/product/transitions";

/**
 * Product persistence.
 *
 * Every public read goes through `publiclyVisibleProduct`, the single predicate
 * ADR-013 requires, rather than restating the two state filters per query.
 * Forgetting one of them leaks hidden content, so the safe version is the only
 * one available here.
 */

/** Columns a public page needs. Selected explicitly; never `select *`. */
const publicColumns = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  tagline: products.tagline,
  description: products.description,
  websiteUrl: products.websiteUrl,
  logoKey: products.logoKey,
  failureStatus: products.failureStatus,
  publishedAt: products.publishedAt,
  createdAt: products.createdAt,
} as const;

/** Adds the columns only an owner or moderator may see. */
const ownerColumns = {
  ...publicColumns,
  ownerId: products.ownerId,
  publicationState: products.publicationState,
  moderationState: products.moderationState,
  updatedAt: products.updatedAt,
} as const;

export type PublicProduct = {
  [K in keyof typeof publicColumns]: (typeof publicColumns)[K]["_"]["data"];
};

export class ProductRepository {
  constructor(private readonly db: Database) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** A product for a public page. Returns null for anything not publicly visible. */
  async findPublicBySlug(slug: string) {
    const [row] = await this.db
      .select({ ...publicColumns, ownerUsername: users.username })
      .from(products)
      .leftJoin(users, eq(products.ownerId, users.id))
      .where(and(eq(products.slug, slug), publiclyVisibleProduct))
      .limit(1);

    return row ?? null;
  }

  /**
   * A product for an authorization decision.
   *
   * Deliberately unfiltered by visibility: the caller needs the real row to ask
   * `can(viewer, verb, product)`. `AGENTS.md` §7 requires authorization to
   * re-load the record server-side rather than trust anything from the request.
   */
  async findForAuthorization(id: string) {
    const [row] = await this.db
      .select(ownerColumns)
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    return row ?? null;
  }

  async findBySlugForAuthorization(slug: string) {
    const [row] = await this.db
      .select(ownerColumns)
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);

    return row ?? null;
  }

  /**
   * The product a retired slug used to belong to (ADR-019).
   *
   * Drives the permanent redirect that keeps a renamed product's inbound links
   * and search ranking alive.
   */
  async findByRetiredSlug(slug: string) {
    const [row] = await this.db
      .select({ productId: productSlugHistory.productId, currentSlug: products.slug })
      .from(productSlugHistory)
      .innerJoin(products, eq(productSlugHistory.productId, products.id))
      .where(eq(productSlugHistory.slug, slug))
      .limit(1);

    return row ?? null;
  }

  /** Everything one owner has, including drafts. Their dashboard list. */
  listByOwner(ownerId: string, limit = 50) {
    return this.db
      .select(ownerColumns)
      .from(products)
      .where(eq(products.ownerId, ownerId))
      .orderBy(desc(products.updatedAt))
      .limit(limit);
  }

  /**
   * A page of the public directory, newest first.
   *
   * Cursor pagination, not offset (`ENGINEERING.md` §5): an offset re-scans
   * every skipped row and shifts under inserts, so page 2 can repeat or drop a
   * product that was published while the visitor was reading page 1.
   *
   * The cursor is `(publishedAt, id)` rather than `publishedAt` alone, because
   * timestamps tie and a tie at a page boundary is exactly where a row goes
   * missing.
   */
  listPublic(input: { limit: number; cursor?: { publishedAt: Date; id: string } }) {
    const keyset = input.cursor
      ? or(
          lt(products.publishedAt, input.cursor.publishedAt),
          and(
            eq(products.publishedAt, input.cursor.publishedAt),
            lt(products.id, input.cursor.id)
          )
        )
      : undefined;

    return this.db
      .select(publicColumns)
      .from(products)
      .where(and(publiclyVisibleProduct, keyset))
      .orderBy(desc(products.publishedAt), desc(products.id))
      .limit(input.limit);
  }

  // -------------------------------------------------------------------------
  // Slug reservation
  // -------------------------------------------------------------------------

  /**
   * Whether a slug is free across **both** namespaces.
   *
   * A retired slug is still taken. ADR-019 forbids reuse across products
   * precisely because a new product inheriting a retired slug also inherits the
   * previous one's inbound links and whatever reputation came with them.
   *
   * Advisory, like every check of this shape — two writers can both read
   * "free". The unique indexes on `products.slug` and
   * `product_slug_history.slug` are what actually decide, and `create` is
   * written to expect that.
   */
  async isSlugAvailable(slug: string) {
    const [taken] = await this.db
      .select({ slug: products.slug })
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    if (taken) return false;

    const [retired] = await this.db
      .select({ slug: productSlugHistory.slug })
      .from(productSlugHistory)
      .where(eq(productSlugHistory.slug, slug))
      .limit(1);

    return !retired;
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * Inserts a product at a specific slug.
   *
   * Returns null when the slug was taken between the availability check and
   * this insert, so the caller can try the next candidate. Losing that race is
   * ordinary, not exceptional — two people naming a product the same thing at
   * the same moment is the case this is built for.
   */
  async createAtSlug(input: {
    ownerId: string;
    slug: string;
    name: string;
    tagline: string | null;
    description: string | null;
    websiteUrl: string | null;
    failureStatus: FailureStatus;
  }) {
    const [row] = await this.db
      .insert(products)
      .values(input)
      .onConflictDoNothing({ target: products.slug })
      .returning({ id: products.id, slug: products.slug });

    return row ?? null;
  }

  updateDetails(
    productId: string,
    fields: {
      name?: string;
      tagline?: string | null;
      description?: string | null;
      websiteUrl?: string | null;
    }
  ) {
    return this.db
      .update(products)
      .set({ ...fields, updatedAt: sql`now()` })
      .where(eq(products.id, productId))
      .returning({ id: products.id });
  }

  /**
   * Moves a product to a new slug and retires the old one, atomically (ADR-019).
   *
   * This is one statement rather than two, and that is the whole point. The
   * `neon-http` driver has no transactions — verified: `db.transaction()`
   * throws "No transactions support in neon-http driver" — so two statements
   * would leave a window in which the product has moved but the old slug is
   * unreserved, free for another product to claim and inherit the inbound links
   * of. A single statement is atomic without needing one.
   *
   * The order inside the CTE is forced by the trigger installed in migration
   * 0001, which rejects a history row for a slug still present in `products`.
   * Updating first inside the same statement satisfies it — verified against
   * the database, since it depends on what the trigger's snapshot sees.
   *
   * The `slug = oldSlug` guard makes it a no-op rather than a corruption if the
   * product was renamed by someone else in between.
   */
  async renameSlug(input: {
    productId: string;
    oldSlug: string;
    newSlug: string;
    historyId: string;
  }) {
    const rows = await this.db.execute<{ slug: string }>(sql`
      WITH moved AS (
        UPDATE ${products}
           SET slug = ${input.newSlug}, updated_at = now()
         WHERE id = ${input.productId}
           AND slug = ${input.oldSlug}
        RETURNING id
      )
      INSERT INTO ${productSlugHistory} (id, product_id, slug)
      SELECT ${input.historyId}, id, ${input.oldSlug} FROM moved
      RETURNING slug
    `);

    // No rows means the guard did not match: someone else renamed it first.
    return (rows.rows ?? rows).length > 0
      ? { id: input.productId, slug: input.newSlug }
      : null;
  }

  setPublicationState(
    productId: string,
    state: PublicationState,
    publishedAt?: Date
  ) {
    return this.db
      .update(products)
      .set({
        publicationState: state,
        // Set once, on the first publish. It records when the listing first
        // became public, which is not the same as the most recent publish.
        ...(publishedAt ? { publishedAt } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(products.id, productId))
      .returning({ id: products.id });
  }

  setModerationState(productId: string, state: ModerationState) {
    return this.db
      .update(products)
      .set({ moderationState: state, updatedAt: sql`now()` })
      .where(eq(products.id, productId))
      .returning({ id: products.id });
  }

  setFailureStatus(productId: string, status: FailureStatus) {
    return this.db
      .update(products)
      .set({ failureStatus: status, updatedAt: sql`now()` })
      .where(eq(products.id, productId))
      .returning({ id: products.id });
  }

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------

  /** One audited status change. Written for every transition, on every axis. */
  recordStatusChange(input: {
    productId: string;
    axis: StatusAxis;
    fromValue: string | null;
    toValue: string;
    actorId: string | null;
    actorRole: "OWNER" | "MODERATOR" | "SYSTEM";
    reason?: string | null;
  }) {
    return this.db.insert(productStatusHistory).values(input);
  }

  /** The timeline for one product, newest first, across all three axes. */
  listStatusHistory(productId: string, limit = 100) {
    return this.db
      .select({
        id: productStatusHistory.id,
        axis: productStatusHistory.axis,
        fromValue: productStatusHistory.fromValue,
        toValue: productStatusHistory.toValue,
        // The id is included for the moderation audit. A timeline rendered to
        // the public must project it away rather than passing this straight on.
        actorId: productStatusHistory.actorId,
        actorRole: productStatusHistory.actorRole,
        reason: productStatusHistory.reason,
        createdAt: productStatusHistory.createdAt,
      })
      .from(productStatusHistory)
      .where(eq(productStatusHistory.productId, productId))
      .orderBy(desc(productStatusHistory.createdAt))
      .limit(limit);
  }
}
