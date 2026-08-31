// tests/integration/schema-constraints.test.ts
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { categories, tags } from "@/db/schema/taxonomy";
import { products, productSlugHistory } from "@/db/schema/products";
import { users } from "@/db/schema/users";
import { uuidv7 } from "@/lib/ids/uuid-v7";
import { noDatabase, testDb, unique } from "./database";

/**
 * A unique index is not proven by a successful insert. It is proven by the
 * duplicate that fails (.plans/02-testing.md), so every constraint here is
 * tested by violating it.
 */

describe.skipIf(noDatabase)("schema constraints", () => {
  const db = noDatabase ? null : testDb();
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdCategoryIds: string[] = [];

  async function createUser(
    overrides: Partial<typeof users.$inferInsert> = {}
  ) {
    const handle = unique("user");
    const [row] = await db!
      .insert(users)
      .values({
        username: handle,
        usernameLower: handle.toLowerCase(),
        email: `${handle}@example.test`,
        ...overrides,
      })
      .returning();

    createdUserIds.push(row!.id);
    return row!;
  }

  async function createProduct(
    ownerId: string,
    overrides: Partial<typeof products.$inferInsert> = {}
  ) {
    const [row] = await db!
      .insert(products)
      .values({
        ownerId,
        slug: unique("product"),
        name: "A product",
        failureStatus: "ABANDONED",
        ...overrides,
      })
      .returning();

    createdProductIds.push(row!.id);
    return row!;
  }

  afterAll(async () => {
    if (!db) return;

    // Products may outlive users as anonymous records, but a test may have
    // created one without the other, so both are cleaned explicitly.
    if (createdProductIds.length) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (createdCategoryIds.length) {
      await db
        .delete(categories)
        .where(inArray(categories.id, createdCategoryIds));
    }
  });

  describe("users", () => {
    it("rejects a second account with the same lowercased username", async () => {
      const user = await createUser();

      await expect(
        createUser({
          username: user.username.toUpperCase(),
          usernameLower: user.usernameLower,
        })
      ).rejects.toThrow();
    });

    it("rejects a second account with the same email", async () => {
      const user = await createUser();

      await expect(createUser({ email: user.email })).rejects.toThrow();
    });

    it("allows many accounts with no email", async () => {
      // GitHub may not release a verified address; nullable must stay usable.
      await expect(createUser({ email: null })).resolves.toBeDefined();
      await expect(createUser({ email: null })).resolves.toBeDefined();
    });
  });

  describe("products", () => {
    it("rejects a second product with the same slug", async () => {
      const user = await createUser();
      const product = await createProduct(user.id);

      await expect(
        createProduct(user.id, { slug: product.slug })
      ).rejects.toThrow();
    });

    it("preserves a product as anonymous when its owner is deleted", async () => {
      const user = await createUser();
      const product = await createProduct(user.id);
      await db!.delete(users).where(eq(users.id, user.id));

      const [remaining] = await db!
        .select({ ownerId: products.ownerId })
        .from(products)
        .where(eq(products.id, product.id));
      expect(remaining?.ownerId).toBeNull();
    });

    it("rejects an owner that does not exist", async () => {
      await expect(createProduct(uuidv7())).rejects.toThrow();
    });

    it("defaults to DRAFT and NONE", async () => {
      // ADR-013: a new product is neither published nor moderated.
      const user = await createUser();
      const product = await createProduct(user.id);

      expect(product.publicationState).toBe("DRAFT");
      expect(product.moderationState).toBe("NONE");
    });

    it("rejects a failure status outside the enum", async () => {
      const user = await createUser();

      await expect(
        createProduct(user.id, { failureStatus: "THRIVING" as never })
      ).rejects.toThrow();
    });

    it("rejects a current slug that was already retired", async () => {
      const user = await createUser();
      const first = await createProduct(user.id);
      const second = await createProduct(user.id);
      const retired = unique("retired");

      await db!
        .insert(productSlugHistory)
        .values({ productId: first.id, slug: retired });

      await expect(
        db!
          .update(products)
          .set({ slug: retired })
          .where(eq(products.id, second.id))
      ).rejects.toThrow();
    });
  });

  describe("categories", () => {
    it("rejects a duplicate slug", async () => {
      const slug = unique("category");
      const [row] = await db!
        .insert(categories)
        .values({ slug, name: unique("Category") })
        .returning();
      createdCategoryIds.push(row!.id);

      await expect(
        db!.insert(categories).values({ slug, name: unique("Category") })
      ).rejects.toThrow();
    });
  });

  describe("tags", () => {
    it("rejects a duplicate slug", async () => {
      const slug = unique("tag");

      await db!.insert(tags).values({ slug, name: slug });

      await expect(
        db!.insert(tags).values({ slug, name: slug })
      ).rejects.toThrow();

      await db!.delete(tags).where(eq(tags.slug, slug));
    });
  });

  describe("slug history (ADR-019)", () => {
    it("rejects a duplicate retired slug", async () => {
      const user = await createUser();
      const product = await createProduct(user.id);
      const other = await createProduct(user.id);
      const retired = unique("retired");

      await db!
        .insert(productSlugHistory)
        .values({ productId: product.id, slug: retired });

      // The unique index is global, not per product: a retired slug carries the
      // first product's inbound links, and must never point at a second one.
      await expect(
        db!
          .insert(productSlugHistory)
          .values({ productId: other.id, slug: retired })
      ).rejects.toThrow();
    });

    it("records every slug a product has had", async () => {
      const user = await createUser();
      const product = await createProduct(user.id);
      const first = unique("was");
      const second = unique("also-was");

      await db!.insert(productSlugHistory).values([
        { productId: product.id, slug: first },
        { productId: product.id, slug: second },
      ]);

      const history = await db!
        .select()
        .from(productSlugHistory)
        .where(eq(productSlugHistory.productId, product.id));

      expect(history.map((row) => row.slug).sort()).toEqual(
        [first, second].sort()
      );
    });
  });
});
