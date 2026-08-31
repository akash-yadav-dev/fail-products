import {
  integer,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, updatedAt } from "@/db/schema/columns";
import { users } from "@/db/schema/users";

export const authRateLimitScopeEnum = pgEnum("auth_rate_limit_scope", [
  "EMAIL",
  "IP",
]);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: primaryId(),
    email: varchar("email", { length: 320 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("auth_tokens_token_hash_key").on(table.tokenHash),
    index("auth_tokens_email_created_idx").on(table.email, table.createdAt),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_key").on(table.tokenHash),
  ]
);

export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    id: primaryId(),
    scope: authRateLimitScopeEnum("scope").notNull(),
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
    uniqueIndex("auth_rate_limits_scope_key_hash_key").on(table.scope, table.keyHash),
  ]
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 128 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("auth_accounts_provider_account_key").on(
      table.provider,
      table.providerAccountId
    ),
    uniqueIndex("auth_accounts_user_provider_key").on(table.userId, table.provider),
  ]
);

export type AuthTokenRow = typeof authTokens.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
