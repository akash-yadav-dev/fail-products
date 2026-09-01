// src/db/schema/products.ts
import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, updatedAt } from "@/db/schema/columns";
import {
  actorRoleEnum,
  failureStatusEnum,
  moderationStateEnum,
  publicationStateEnum,
  statusAxisEnum,
} from "@/db/schema/enums";
import { categories, tags } from "@/db/schema/taxonomy";
import { users } from "@/db/schema/users";

/**
 * `tsvector`, which Drizzle has no built-in type for.
 *
 * Declared here rather than left out of the schema so `drizzle-kit generate`
 * does not see the column as drift and try to drop it on the next migration.
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * A listed product.
 *
 * Listings are owner-only (docs/LEGAL.md): `ownerId` is the founder, not a
 * submitter. Account deletion may leave a listing with anonymous authorship;
 * third-party listings are Post-MVP and need a consent and delist system.
 */
export const products = pgTable(
  "products",
  {
    id: primaryId(),

    ownerId: uuid("owner_id")
      // Account deletion may transfer a listing to anonymous authorship. The
      // service decides whether to delete or anonymise each product before it
      // deletes the user; the database preserves the latter choice as NULL.
      .references(() => users.id, { onDelete: "set null" }),

    /** The current canonical slug. Retired ones live in product_slug_history. */
    slug: varchar("slug", { length: 96 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    tagline: varchar("tagline", { length: 200 }),
    description: text("description"),

    /** Validated http/https at write and at render (docs/SECURITY.md). */
    websiteUrl: text("website_url"),
    /** An R2 object key from a CSPRNG, never a user filename (ADR-020). */
    logoKey: text("logo_key"),

    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),

    // ADR-013: three axes, three columns. Every public list query filters on
    // publication_state AND moderation_state; forgetting one leaks hidden
    // content, which is why the repository layer wraps this pair.
    failureStatus: failureStatusEnum("failure_status").notNull(),
    publicationState: publicationStateEnum("publication_state")
      .notNull()
      .default("DRAFT"),
    moderationState: moderationStateEnum("moderation_state")
      .notNull()
      .default("NONE"),

    /** When it first became publicly visible. Null until it is published. */
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),

    /**
     * Full-text search over the product's own words (Phase 2 slice 2.4).
     *
     * Postgres, not a search service. `CLAUDE.md` §7 forbids Stage 2
     * infrastructure without a measurement proving the need, and a directory
     * targeting 50–100 listings before launch has not measured anything that
     * Postgres cannot do.
     *
     * A **generated** column, not a trigger and not application code: it cannot
     * go stale, because there is no code path that updates the row without
     * updating it. The weights are `setweight`'s, so a query matching a product
     * name outranks the same word buried in a paragraph.
     */
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(name, '')), 'A') || setweight(to_tsvector('english', coalesce(tagline, '')), 'B') || setweight(to_tsvector('english', coalesce(description, '')), 'C')`
    ),
  },
  (table) => [
    uniqueIndex("products_slug_key").on(table.slug),
    index("products_owner_id_idx").on(table.ownerId),
    index("products_category_id_idx").on(table.categoryId),
    // The public list: filtered on both state columns, newest first.
    index("products_public_listing_idx").on(
      table.publicationState,
      table.moderationState,
      table.publishedAt
    ),
    index("products_failure_status_idx").on(table.failureStatus),
    // GIN, not GiST: this index is read far more than it is written, and GIN
    // answers a tsvector match faster at the cost of a slower update.
    index("products_search_idx").using("gin", table.searchVector),
    // A published listing always knows when it went public.
    //
    // The public list is keyset-paginated on `published_at` (slice 2.1), and a
    // NULL sorts outside that ordering — the row would appear on page 1 and
    // then be unreachable from the cursor, which reads as a product silently
    // disappearing rather than as the data defect it is. `changePublicationState`
    // already stamps the column on the first publish; this makes that an
    // invariant the database holds rather than one the service remembers.
    check(
      "products_published_at_required",
      sql`${table.publicationState} <> 'PUBLISHED' OR ${table.publishedAt} IS NOT NULL`
    ),
  ]
);

/**
 * Every slug a product has ever had (ADR-019).
 *
 * A rename without a redirect discards every inbound link and every ranking the
 * page earned, and the loss is invisible until the traffic is already gone.
 * Slugs are never reused across products, which is why the unique index is on
 * the slug alone and not on (product_id, slug).
 *
 * It ships with the first product migration, never later — retrofitting it
 * cannot recover the slugs that were already discarded.
 */
export const productSlugHistory = pgTable(
  "product_slug_history",
  {
    id: primaryId(),
    productId: uuid("product_id")
      // Slug reservations survive product deletion so a retired URL can never
      // be reissued to another product (ADR-019).
      .references(() => products.id, { onDelete: "set null" }),
    slug: varchar("slug", { length: 96 }).notNull(),
    /** Its own column, not the shared `created_at`: this row records a retirement. */
    retiredAt: timestamp("retired_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    // Global, not per product: a retired slug must never be reissued to a
    // different product, or it inherits the other one's inbound links.
    uniqueIndex("product_slug_history_slug_key").on(table.slug),
    index("product_slug_history_product_id_idx").on(table.productId),
  ]
);

/**
 * Every status change a product has ever undergone, on any of the three axes
 * (ADR-013).
 *
 * The point of this table is accountability: a moderator action and an owner
 * action are both recorded, with who did it and why, so "why is this hidden?"
 * has an answer that does not depend on anyone's memory.
 *
 * `fromValue` and `toValue` are `varchar` rather than enums, which is
 * deliberate. The three axes have three different value sets, and one column
 * cannot be three enum types — the `axis` column is what makes a value
 * interpretable. Postgres would also refuse to drop a value from an enum that a
 * history row still references, which would make the history table veto every
 * future change to the states themselves.
 */
export const productStatusHistory = pgTable(
  "product_status_history",
  {
    id: primaryId(),

    productId: uuid("product_id")
      .notNull()
      // History dies with the product. It exists to explain a listing that is
      // on the site; retaining moderation records for a deleted listing would
      // keep personal data past its purpose (docs/LEGAL.md).
      .references(() => products.id, { onDelete: "cascade" }),

    axis: statusAxisEnum("axis").notNull(),

    /** Null for the row written at creation: there was no previous value. */
    fromValue: varchar("from_value", { length: 32 }),
    toValue: varchar("to_value", { length: 32 }).notNull(),

    /** Null once the acting account is deleted. The action still happened. */
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorRole: actorRoleEnum("actor_role").notNull(),

    /** Required by policy for moderation actions; the service enforces that. */
    reason: text("reason"),

    createdAt: createdAt(),
  },
  (table) => [
    // The timeline query: one product, newest first.
    index("product_status_history_product_idx").on(
      table.productId,
      table.createdAt
    ),
    // The moderation audit: everything one moderator did.
    index("product_status_history_actor_idx").on(table.actorId),
  ]
);

/** Products to tags. A join table, so a tag rename never rewrites product rows. */
export const productTags = pgTable(
  "product_tags",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.tagId] }),
    index("product_tags_tag_id_idx").on(table.tagId),
  ]
);

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
export type ProductSlugHistoryRow = typeof productSlugHistory.$inferSelect;
export type ProductStatusHistoryRow = typeof productStatusHistory.$inferSelect;
export type NewProductStatusHistoryRow = typeof productStatusHistory.$inferInsert;
