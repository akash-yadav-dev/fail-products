// src/db/schema/waitlists.ts
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, updatedAt } from "@/db/schema/columns";
import { products } from "@/db/schema/products";
import { users } from "@/db/schema/users";
import { WAITLIST_ENTRY_STATUSES } from "@/domain/waitlist/signup";

/**
 * Where an entry is between joining and being reachable (ADR-029).
 *
 * Derived from the domain module rather than restated, the same way
 * `failure_status` and `report_reason` are: one list, and the database reads
 * it, so the enum and the form cannot disagree.
 *
 * There is no UNSUBSCRIBED. `docs/LEGAL.md` §5 files a waitlist entry as
 * consent-based and says it is **erased** on request by the subscriber — a row
 * flagged as unsubscribed is personal data that has not been deleted, which the
 * same section names as a finding rather than a design.
 */
export const waitlistEntryStatusEnum = pgEnum(
  "waitlist_entry_status",
  WAITLIST_ENTRY_STATUSES as unknown as [string, ...string[]]
);

/**
 * An address that asked to hear when a product comes back.
 *
 * This table holds **third parties' email addresses given under consent**, and
 * that single fact decides most of its shape:
 *
 * - `consented_at` and `consent_statement` are `NOT NULL`. The consent record
 *   is not metadata about the row; it is the lawful basis for every message
 *   that address will receive. A nullable column here would make "we have no
 *   record of consent" a state the database permits, and the first import or
 *   backfill would produce one.
 * - The statement is stored **verbatim**, not as a version pointer. Consent is
 *   only evidence if you can show what was agreed to, and a pointer into a
 *   document that has since been edited shows nothing.
 * - Deletion is deletion. `ON DELETE CASCADE` from the product, and the
 *   unsubscribe path removes the row outright.
 *
 * Double opt-in (ADR-029): a new entry is PENDING and carries a hashed
 * confirmation token. Only a CONFIRMED entry may be mailed or exported.
 */
export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: primaryId(),

    productId: uuid("product_id")
      .notNull()
      // The consent was given to hear about *this product*. When the listing
      // goes, the basis for holding the address goes with it — docs/LEGAL.md §5
      // retains an entry "until product deletion or unsubscribe".
      .references(() => products.id, { onDelete: "cascade" }),

    /** Normalised: trimmed and lowercased, so one mailbox is one row. */
    email: varchar("email", { length: 320 }).notNull(),

    status: waitlistEntryStatusEnum("status").notNull().default("PENDING"),

    /**
     * When consent was given, and to what.
     *
     * Both required. `docs/LEGAL.md` §5 marks this data consent-based, and a
     * consent with no timestamp cannot be shown to have preceded the email it
     * authorised.
     */
    consentedAt: timestamp("consented_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .default(sql`now()`),
    consentStatement: varchar("consent_statement", { length: 400 }).notNull(),

    /**
     * The confirmation link's token, hashed.
     *
     * Never stored raw, for the same reason a session token is not: the table
     * is readable by anything that can read the database, and a raw token is a
     * credential that confirms somebody else's subscription. Null once the
     * entry is confirmed — the token is single-use and there is no reason to
     * keep it afterwards.
     */
    confirmationTokenHash: varchar("confirmation_token_hash", { length: 64 }),

    confirmedAt: timestamp("confirmed_at", {
      withTimezone: true,
      mode: "date",
    }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    /**
     * One address, one entry, per product.
     *
     * This is what makes a duplicate signup idempotent rather than a second
     * row: the insert is an upsert on this index. Both columns are `NOT NULL`,
     * which matters — Postgres treats NULLs in a unique index as distinct, so a
     * unique index over a nullable column constrains far less than it appears
     * to. (`reports` needed two partial indexes for exactly that reason.) Here
     * neither column can be null, so the index means what it reads as.
     */
    uniqueIndex("waitlist_entries_product_email_key").on(
      table.productId,
      table.email
    ),
    // The export and the dashboard count: one product, confirmed rows, oldest
    // first. Also the keyset the streaming export pages on.
    index("waitlist_entries_product_status_idx").on(
      table.productId,
      table.status,
      table.createdAt
    ),
    // Confirming a subscription looks the row up by this and nothing else.
    index("waitlist_entries_token_idx").on(table.confirmationTokenHash),

    // A confirmed entry knows when, and holds no live token; a pending one is
    // the mirror image. Without this the two columns and the status can drift,
    // and "is this address confirmed?" then has two answers that disagree.
    check(
      "waitlist_entries_confirmation_complete",
      sql`(${table.status} = 'PENDING' AND ${table.confirmedAt} IS NULL AND ${table.confirmationTokenHash} IS NOT NULL)
       OR (${table.status} = 'CONFIRMED' AND ${table.confirmedAt} IS NOT NULL AND ${table.confirmationTokenHash} IS NULL)`
    ),
  ]
);

/**
 * A record that somebody downloaded a product's subscriber list.
 *
 * `docs/SECURITY.md` §11 requires the waitlist CSV export to be audit-logged as
 * well as rate-limited, because it is the one endpoint in the application that
 * hands over bulk personal data in a single request. The rate limit bounds how
 * often; this is what makes "who took the list, and when" answerable after the
 * fact, which is the question that gets asked when a list turns up somewhere
 * it should not be.
 *
 * It holds **no subscriber data** — a product, an actor, a count, a time. The
 * CSV itself is never retained server-side (`docs/LEGAL.md` §5).
 */
export const waitlistExports = pgTable(
  "waitlist_exports",
  {
    id: primaryId(),

    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),

    /** Null once the account is deleted. The export still happened. */
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),

    /** How many entries were in the file. Zero is a meaningful answer. */
    rowCount: integer("row_count").notNull(),

    createdAt: createdAt(),
  },
  (table) => [
    index("waitlist_exports_product_idx").on(table.productId, table.createdAt),
    index("waitlist_exports_actor_idx").on(table.actorId),
  ]
);

export type WaitlistEntryRow = typeof waitlistEntries.$inferSelect;
export type NewWaitlistEntryRow = typeof waitlistEntries.$inferInsert;
export type WaitlistExportRow = typeof waitlistExports.$inferSelect;
