// src/db/schema/security.ts
import {
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, updatedAt } from "@/db/schema/columns";

/**
 * What a limit is counted against (ADR-017, docs/SECURITY.md §11).
 *
 * The scope is stored rather than folded into the key alone so a row is
 * readable: "this account has posted five comments" and "this address has
 * requested four codes" are different facts, and an operator looking at the
 * table during an incident needs to tell them apart.
 */
export const rateLimitScopeEnum = pgEnum("rate_limit_scope", [
  "EMAIL",
  "IP",
  "USER",
]);

/**
 * The counted rate-limit layer.
 *
 * One table for every counted limit in the application, not one per feature.
 * The rule name is part of the hashed key, so two rules can never share a
 * counter (`rateLimitKey` in `lib/security/rate-limit.ts` is what guarantees
 * that), and a new limit needs no migration.
 *
 * **Counted, not edge.** ADR-017 reserves this layer for anything needing an
 * accurate global count, and it costs a write on the request path. The Workers
 * `ratelimit` binding is the cheaper layer for casual abuse — it is also
 * per-colocation and eventually consistent, which is why nothing guarding a
 * secret or a moderation surface uses it.
 *
 * The subject is **hashed**, never stored raw. An email address or an account
 * id in a counter row is personal data sitting in a table whose only purpose is
 * arithmetic (docs/LEGAL.md §5), and the counter works identically either way.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    id: primaryId(),
    scope: rateLimitScopeEnum("scope").notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    count: integer("count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("rate_limits_scope_key_hash_key").on(table.scope, table.keyHash),
    // Garbage collection reads this column and nothing else does. Without the
    // index the sweep is a sequential scan of every counter in the application
    // on the request path — which is how a rate limiter becomes the thing that
    // needs rate limiting.
    index("rate_limits_updated_at_idx").on(table.updatedAt),
  ]
);

export type RateLimitRow = typeof rateLimits.$inferSelect;
