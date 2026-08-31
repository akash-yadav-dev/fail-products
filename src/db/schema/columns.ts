// src/db/schema/columns.ts
import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

import { uuidv7 } from "@/lib/ids/uuid-v7";

/**
 * Column shapes every table repeats, defined once so they cannot drift.
 *
 * The primary key is generated in the application rather than by Postgres
 * (ADR-021): a `uuidv7()` default would bind the schema to a Postgres version
 * that has not been verified on Neon, and generating it here also means an
 * insert knows its own id without a round trip.
 */

export function primaryId() {
  return uuid("id").primaryKey().$defaultFn(uuidv7);
}

/**
 * `timestamptz`, always. A naive timestamp silently reinterprets itself when
 * the server's zone changes, and this application will run in several.
 */
export function createdAt() {
  return timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`);
}

export function updatedAt() {
  return timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => new Date());
}
