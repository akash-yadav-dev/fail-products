// tests/integration/product-visibility.test.ts
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

import { publiclyVisibleProduct } from "@/db/queries/product-visibility";
import { products } from "@/db/schema/products";
import { users } from "@/db/schema/users";
import { noDatabase, testDb, unique } from "./database";

/**
 * The query shape every public list will reuse.
 *
 * ADR-013 warns that a list filtering on only one of the two state columns
 * leaks hidden content. Each case below inserts a row that must not come back
 * and asserts that it does not — the successful case proves nothing on its own.
 */

describe.skipIf(noDatabase)("publicly visible products", () => {
  const db = noDatabase ? null : testDb();
  const createdUserIds: string[] = [];

  async function owner() {
    const handle = unique("owner");
    const [row] = await db!
      .insert(users)
      .values({
        username: handle,
        usernameLower: handle.toLowerCase(),
        email: `${handle}@example.test`,
      })
      .returning();

    createdUserIds.push(row!.id);
    return row!.id;
  }

  async function product(
    ownerId: string,
    state: Partial<typeof products.$inferInsert>
  ) {
    const [row] = await db!
      .insert(products)
      .values({
        ownerId,
        slug: unique("visibility"),
        name: "Visibility fixture",
        failureStatus: "ABANDONED",
        ...state,
      })
      .returning();

    return row!;
  }

  /** Does this specific row survive the public filter? */
  async function isVisible(id: string): Promise<boolean> {
    const rows = await db!
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, id), publiclyVisibleProduct));

    return rows.length === 1;
  }

  afterAll(async () => {
    // Products may outlive the owner row as anonymous records.
    if (db && createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  it("returns a published, unmoderated product", async () => {
    const row = await product(await owner(), {
      publicationState: "PUBLISHED",
      moderationState: "NONE",
      publishedAt: new Date(),
    });

    await expect(isVisible(row.id)).resolves.toBe(true);
  });

  it("excludes a draft", async () => {
    const row = await product(await owner(), {
      publicationState: "DRAFT",
      moderationState: "NONE",
    });

    await expect(isVisible(row.id)).resolves.toBe(false);
  });

  it("excludes one awaiting review", async () => {
    const row = await product(await owner(), {
      publicationState: "PENDING_REVIEW",
      moderationState: "NONE",
    });

    await expect(isVisible(row.id)).resolves.toBe(false);
  });

  it("excludes one the owner archived", async () => {
    const row = await product(await owner(), {
      publicationState: "ARCHIVED",
      moderationState: "NONE",
    });

    await expect(isVisible(row.id)).resolves.toBe(false);
  });

  it("excludes a hidden product even though it is published", async () => {
    // The case a single-column filter would leak.
    const row = await product(await owner(), {
      publicationState: "PUBLISHED",
      moderationState: "HIDDEN",
      publishedAt: new Date(),
    });

    await expect(isVisible(row.id)).resolves.toBe(false);
  });

  it("excludes a removed product even though it is published", async () => {
    const row = await product(await owner(), {
      publicationState: "PUBLISHED",
      moderationState: "REMOVED",
      publishedAt: new Date(),
    });

    await expect(isVisible(row.id)).resolves.toBe(false);
  });

  it("returns a flagged product", async () => {
    // PRODUCT.md §6 keeps flagged products public; HIDDEN and REMOVED are the
    // moderation states that remove a published listing.
    const row = await product(await owner(), {
      publicationState: "PUBLISHED",
      moderationState: "FLAGGED",
      publishedAt: new Date(),
    });

    await expect(isVisible(row.id)).resolves.toBe(true);
  });
});
