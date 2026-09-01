// src/db/schema/products.ts
import { sql } from "drizzle-orm";
import {
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
