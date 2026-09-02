// src/repositories/product-repository.ts
import { and, asc, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db";
import { publiclyVisibleProduct } from "@/db/queries/product-visibility";
import {
  categories,
  productSlugHistory,
  productStatusHistory,
  products,
  users,
} from "@/db/schema";
import type { FailureStatus } from "@/domain/product/failure-status";
import type { ProductCursor, ProductSort } from "@/domain/product/listing";
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
  // Public because the card shows it: `DESIGN.md` §7 puts "Last updated" on
  // every card, and a directory of failures has to say how stale an entry is.
  updatedAt: products.updatedAt,
} as const;

/** Adds the columns only an owner or moderator may see. */
const ownerColumns = {
  ...publicColumns,
  ownerId: products.ownerId,
  publicationState: products.publicationState,
  moderationState: products.moderationState,
} as const;

/**
 * A card's columns: the public product plus the category it sits in.
 *
 * The category comes from a join rather than a query per row, because a page of
 * 24 cards each fetching its own category is the N+1 `ENGINEERING.md` §5
 * forbids.
 */
const listColumns = {
  ...publicColumns,
  categorySlug: categories.slug,
  categoryName: categories.name,
} as const;

export type PublicProduct = {
  [K in keyof typeof publicColumns]: (typeof publicColumns)[K]["_"]["data"];
};

/**
 * One row of a public list.
 *
 * Derived from the query rather than from `listColumns`, because the two are
 * not the same shape: the category comes through a LEFT JOIN, so `categorySlug`
 * and `categoryName` are nullable in the result even though the columns they
 * select are `NOT NULL` on their own table. A hand-written mapped type over the
 * column map loses that and tells callers a category is always present.
 */
export type ProductListItem = Awaited<
  ReturnType<ProductRepository["listPublic"]>
>[number];

/**
 * What a public list may be narrowed by.
 *
 * One shape for every public list — `/products`, `/status/[slug]`,
 * `/categories/[slug]`, and search — so a new surface reuses the filtered,
 * state-checked query instead of writing a fourth one that forgets a filter.
 */
export type PublicListFilters = {
  failureStatus?: FailureStatus;
  categoryId?: string;
};

/**
 * The tsquery a search runs.
 *
 * `websearch_to_tsquery`, not `to_tsquery`. It is the only one of the family
 * built for raw user input: it accepts quoted phrases and `-exclusion` the way
 * a visitor expects, and it never raises a syntax error on unbalanced quotes or
 * stray operators. `to_tsquery('english', 'a & & b')` throws, and a thrown
 * query on a public search box is a 500 anyone can trigger by typing.
 *
 * The value is a bound parameter. Sanitising a string is never what makes a
 * query injection-safe, and nothing in this file pretends otherwise.
 */
function searchQuery(term: string) {
  return sql`websearch_to_tsquery('english', ${term})`;
}

export class ProductRepository {
  constructor(private readonly db: Database) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** A product for a public page. Returns null for anything not publicly visible. */
  async findPublicBySlug(slug: string) {
    const [row] = await this.db
      .select({
        ...publicColumns,
        // Not rendered. It is compared against a comment's author id so the
        // founder indicator can be derived rather than stored — a stored flag
        // would be a snapshot of who owned the listing when the comment was
        // written, and would keep saying "founder" after it changed hands.
        ownerId: products.ownerId,
        ownerUsername: users.username,
      })
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
   * A page of the public directory.
   *
   * The one query every public list is built from. Slice 2.1 of the Phase 2
   * plan requires exactly that: `/products`, `/status/[slug]`, and
   * `/categories/[slug]` differ only by their filters, and three hand-written
   * queries would be three chances to forget a state filter.
   *
   * Cursor pagination, not offset (`ENGINEERING.md` §5): an offset re-scans
   * every skipped row and shifts under inserts, so page 2 can repeat or drop a
   * product that was published while the visitor was reading page 1.
   *
   * The cursor is `(sort column, id)` rather than the timestamp alone, because
   * timestamps tie and a tie at a page boundary is exactly where a row goes
   * missing. `id` is a UUIDv7, so ordering on it descending is a stable
   * tiebreak rather than an arbitrary one.
   *
   * Bounded by `limit`, which `parsePageSize` has already clamped.
   */
  listPublic(input: {
    limit: number;
    sort: ProductSort;
    cursor?: ProductCursor | null;
    filters?: PublicListFilters;
  }) {
    // The sort chooses the column. The allowlist in the domain module is what
    // guarantees it is one of these two and not a string from a query string.
    const sortColumn =
      input.sort === "recently-updated"
        ? products.updatedAt
        : products.publishedAt;

    const keyset = input.cursor
      ? or(
          lt(sortColumn, input.cursor.sortedAt),
          and(
            eq(sortColumn, input.cursor.sortedAt),
            lt(products.id, input.cursor.id)
          )
        )
      : undefined;

    const conditions: (SQL | undefined)[] = [publiclyVisibleProduct, keyset];

    if (input.filters?.failureStatus) {
      conditions.push(eq(products.failureStatus, input.filters.failureStatus));
    }
    if (input.filters?.categoryId) {
      conditions.push(eq(products.categoryId, input.filters.categoryId));
    }

    return this.db
      .select(listColumns)
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(sortColumn), desc(products.id))
      .limit(input.limit);
  }

  /**
   * How many publicly visible products each category holds.
   *
   * Filtered by the same visibility predicate as the list, so a category can
   * never advertise a count that includes rows nobody is allowed to open. The
   * join is `LEFT` on purpose: a category with nothing visible in it comes back
   * as zero rather than vanishing, because "no products yet" and "no such
   * category" are different facts and the page says different things about them.
   */
  countPublicByCategory() {
    return this.db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        description: categories.description,
        productCount: sql<number>`count(${products.id})::int`,
      })
      .from(categories)
      .leftJoin(
        products,
        and(eq(products.categoryId, categories.id), publiclyVisibleProduct)
      )
      .groupBy(
        categories.id,
        categories.slug,
        categories.name,
        categories.description
      )
      .orderBy(asc(categories.name));
  }

  /**
   * A page of search results, ranked by relevance.
   *
   * Separate from `listPublic` rather than a flag on it, because the ordering
   * is genuinely different: a browse list is chronological and keyset
   * paginated, a search is ranked and is not. Folding both into one method
   * would mean a `cursor` parameter that silently does nothing half the time.
   *
   * **One bounded page, no cursor.** A rank-keyset cursor is real work, and the
   * directory targets 50–100 listings before launch (`docs/ROADMAP.md` Phase
   * 4.5) — a relevance page that overflows 48 results is a problem this corpus
   * does not have yet. `CLAUDE.md` §7: the measurement comes first, then the
   * machinery. The caller is expected to tell the visitor the results are
   * capped rather than pretend there is nothing more.
   *
   * The visibility predicate is the same one every other public read uses. A
   * search that could surface a hidden product would be the most direct
   * possible leak: it takes a text query, not a guessed URL.
   */
  searchPublic(input: {
    term: string;
    limit: number;
    filters?: PublicListFilters;
  }) {
    const query = searchQuery(input.term);

    const conditions: (SQL | undefined)[] = [
      publiclyVisibleProduct,
      sql`${products.searchVector} @@ ${query}`,
    ];

    if (input.filters?.failureStatus) {
      conditions.push(eq(products.failureStatus, input.filters.failureStatus));
    }
    if (input.filters?.categoryId) {
      conditions.push(eq(products.categoryId, input.filters.categoryId));
    }

    return this.db
      .select(listColumns)
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions))
      // ts_rank_cd, not ts_rank: it accounts for how close the matched terms
      // are to each other, which is what separates a product about one subject
      // from a paragraph that happens to mention both words.
      //
      // The id breaks ties so the order is at least deterministic between two
      // equally ranked rows; without it Postgres is free to return them in
      // either order on successive runs.
      .orderBy(
        desc(sql`ts_rank_cd(${products.searchVector}, ${query})`),
        desc(products.id)
      )
      .limit(input.limit);
  }

  /**
   * Every publicly visible product, for the sitemap.
   *
   * The one query in this file that is deliberately unpaginated, because a
   * sitemap that stops at page one is a sitemap that hides most of the site.
   * It is still bounded by `limit`, and the caller states the bound — an
   * unbounded read on a metered database is not made safe by being infrequent.
   *
   * The same visibility predicate as everything else. A sitemap listing a
   * hidden product hands a crawler the URL of something a moderator removed,
   * which is worse than a leak on a page nobody linked to.
   */
  listAllPublicForSitemap(limit: number) {
    return this.db
      .select({
        slug: products.slug,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .where(publiclyVisibleProduct)
      .orderBy(desc(products.updatedAt))
      .limit(limit);
  }

  /** One category by its public slug, or null. Drives the 404 on an unknown one. */
  async findCategoryBySlug(slug: string) {
    const [row] = await this.db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        description: categories.description,
      })
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);

    return row ?? null;
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
    categoryId?: string | null;
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
