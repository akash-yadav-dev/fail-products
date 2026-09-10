// src/db/schema/referrals.ts
import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, updatedAt } from "@/db/schema/columns";
import { products } from "@/db/schema/products";

/**
 * One outbound click, and the daily aggregate it collapses into (ADR-018).
 *
 * **Both tables are created together, on purpose.** The ADR requires the prune
 * and the rollup to ship in the migration that creates the raw table, because
 * retention added later is a migration against a table that is already too
 * large to migrate comfortably. A rollup introduced after the fact also cannot
 * recover the days it was not there for.
 */

/**
 * A click on a listing's outbound link.
 *
 * **What is deliberately not here is most of the design.** No IP address, no
 * user agent, no session id, no visitor identifier of any kind.
 * `docs/PRODUCT.md` §5 asks for a lightweight event "without invasive visitor
 * profiling", and `docs/LEGAL.md` §5 forbids keeping a raw IP with no
 * documented purpose and retention period. A product id and an instant answer
 * the only question the product asks — how many people left for this listing,
 * and when — so nothing else is collected. That also means a row here is not
 * personal data, which is why a thirty-day window needs no consent record.
 *
 * The consequence is stated rather than hidden: these counts cannot be
 * deduplicated per visitor, so they are clicks and never "unique visitors".
 * The dashboard has to say so.
 */
export const referralEvents = pgTable(
  "referral_events",
  {
    id: primaryId(),

    productId: uuid("product_id")
      .notNull()
      // The events describe this listing. With the listing gone there is
      // nothing they are about.
      .references(() => products.id, { onDelete: "cascade" }),

    createdAt: createdAt(),
  },
  (table) => [
    // The rollup's query: one product's clicks within one day.
    index("referral_events_product_created_idx").on(
      table.productId,
      table.createdAt
    ),
    // The prune's query, which has no product in it at all. Without this the
    // job that runs every day is the one that scans the largest table.
    index("referral_events_created_idx").on(table.createdAt),
  ]
);

/**
 * Clicks per listing per UTC day, kept indefinitely.
 *
 * The rollup **replaces** a day's count rather than adding to it, which is what
 * makes re-running the job safe. An additive rollup that runs twice — a retry,
 * an overlapping schedule, a manual run after an incident — silently doubles
 * every number a founder sees, and nothing about the result looks wrong.
 */
export const referralDaily = pgTable(
  "referral_daily",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),

    /** UTC. `referralDayOf` is the only thing that decides which day a row is. */
    day: date("day").notNull(),

    clicks: integer("clicks").notNull().default(0),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.day] }),
    // The dashboard's read: one product, newest days first.
    index("referral_daily_product_day_idx").on(table.productId, table.day),
  ]
);
