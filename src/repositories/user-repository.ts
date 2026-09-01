// src/repositories/user-repository.ts
import { eq, sql } from "drizzle-orm";

import type { Database } from "@/db";
import { users } from "@/db/schema";

/**
 * Account and profile persistence.
 *
 * Repositories own every Drizzle call (`AGENTS.md` §5). Components and pages
 * never import the schema, so a query cannot be written in a place where the
 * rules that guard it are invisible.
 */
export class UserRepository {
  constructor(private readonly db: Database) {}

  /**
   * The public profile for a handle.
   *
   * Matches on `username_lower`, which is what the unique index covers, so
   * `/u/Akash` and `/u/akash` resolve to the same account rather than one of
   * them 404ing.
   */
  async findByUsername(username: string) {
    const [row] = await this.db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        bio: users.bio,
        websiteUrl: users.websiteUrl,
        avatarKey: users.avatarKey,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.usernameLower, username.trim().toLowerCase()))
      .limit(1);

    return row ?? null;
  }

  async findById(id: string) {
    const [row] = await this.db
      .select({
        id: users.id,
        username: users.username,
        usernameLower: users.usernameLower,
        email: users.email,
        displayName: users.displayName,
        bio: users.bio,
        websiteUrl: users.websiteUrl,
        avatarKey: users.avatarKey,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return row ?? null;
  }

  /**
   * Whether a handle is free.
   *
   * Advisory only. Two requests can both read "free" and both proceed, so the
   * unique index on `username_lower` is what actually decides — this exists to
   * give the common case a good error message instead of a constraint failure.
   */
  async isUsernameAvailable(lowercased: string, exceptUserId?: string) {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.usernameLower, lowercased))
      .limit(1);

    if (!row) return true;
    return exceptUserId !== undefined && row.id === exceptUserId;
  }

  /**
   * Writes profile fields.
   *
   * `usernameLower` is always written alongside `username`, never separately:
   * the pair is what makes case-insensitive uniqueness hold, and a write that
   * updated one without the other would silently defeat the index.
   */
  updateProfile(
    userId: string,
    fields: {
      username?: string;
      usernameLower?: string;
      displayName?: string | null;
      bio?: string | null;
      websiteUrl?: string | null;
    }
  ) {
    return this.db
      .update(users)
      .set({ ...fields, updatedAt: sql`now()` })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
  }
}
