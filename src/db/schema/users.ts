// src/db/schema/users.ts
import { index, pgTable, text, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import { createdAt, primaryId, updatedAt } from "@/db/schema/columns";

/**
 * An account.
 *
 * No password column, and there never will be one — ADR-014 makes
 * authentication passwordless (email link plus GitHub OAuth), so there is no
 * hash to store, no reset flow, and no KDF to run on Workers.
 */
export const users = pgTable(
  "users",
  {
    id: primaryId(),

    /**
     * The public handle. It appears in /u/[username], so it is part of the URL
     * namespace ADR-019 reserves words in.
     */
    username: varchar("username", { length: 39 }),
    /** Lowercased `username`, so uniqueness is case-insensitive. */
    usernameLower: varchar("username_lower", { length: 39 }),

    /**
     * Lowercased at write. Nullable because a GitHub account may not release a
     * verified address, and an account without one is still an account.
     */
    email: varchar("email", { length: 320 }),

    displayName: varchar("display_name", { length: 80 }),
    bio: text("bio"),
    /** Validated http/https at write and at render (docs/SECURITY.md). */
    websiteUrl: text("website_url"),
    /** An R2 object key, never a user-supplied filename (ADR-020). */
    avatarKey: text("avatar_key"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Case-insensitive: "Akash" and "akash" are the same handle.
    uniqueIndex("users_username_lower_key").on(table.usernameLower),
    uniqueIndex("users_email_key").on(table.email),
    index("users_created_at_idx").on(table.createdAt),
  ]
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
