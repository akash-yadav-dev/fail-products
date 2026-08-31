// src/db/schema/taxonomy.ts
import { pgTable, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import { createdAt, primaryId } from "@/db/schema/columns";

/**
 * Categories and tags.
 *
 * Open question 5 — whether the category taxonomy is a fixed list or free-form —
 * is still open, and this table shape answers either way: a fixed list is
 * seeded rows, a free-form one is rows users create. What changes with that
 * decision is *who may insert*, which is a service-layer rule, not a column.
 */

export const categories = pgTable(
  "categories",
  {
    id: primaryId(),
    /** Appears in /categories/[slug]. */
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    description: varchar("description", { length: 200 }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("categories_slug_key").on(table.slug),
    uniqueIndex("categories_name_key").on(table.name),
  ]
);

export const tags = pgTable(
  "tags",
  {
    id: primaryId(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("tags_slug_key").on(table.slug)]
);

export type CategoryRow = typeof categories.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
