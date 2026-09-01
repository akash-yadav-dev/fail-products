// tests/integration/category-taxonomy.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { categories, products, users } from "@/db/schema";
import { PRODUCT_CATEGORIES } from "@/domain/product/category";
import { ProductRepository } from "@/repositories/product-repository";
import {
  ProductError,
  createProduct,
  listPublicDirectory,
} from "@/services/product/product-service";
import { noDatabase, testDb, unique } from "./database";

/**
 * The curated taxonomy, against the database that is supposed to hold it.
 *
 * The list in `src/domain/product/category.ts` is the specification and the
 * seed migration is its copy. Two copies drift. The first suite here is the
 * guard: if they ever disagree, `/categories/[slug]` starts 404ing for reasons
 * nothing in the code explains.
 */

describe.skipIf(noDatabase)("category taxonomy", () => {
  const db = noDatabase ? null : testDb();
  const repository = noDatabase ? null : new ProductRepository(db!);

  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];
  let ownerId: string;

  beforeAll(async () => {
    if (!db) return;
    const handle = unique("catowner");
    const [row] = await db
      .insert(users)
      .values({
        username: handle,
        usernameLower: handle.toLowerCase(),
        email: `${handle}@example.test`,
      })
      .returning();
    createdUserIds.push(row!.id);
    ownerId = row!.id;
  });

  afterAll(async () => {
    if (!db) return;
    if (createdProductIds.length > 0) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  describe("the seed matches the domain list", () => {
    it("has every curated category in the table, with the same id and name", async () => {
      const rows = await db!.select().from(categories);
      const bySlug = new Map(rows.map((row) => [row.slug, row]));

      for (const category of PRODUCT_CATEGORIES) {
        const row = bySlug.get(category.slug);

        expect(row, `missing category: ${category.slug}`).toBeDefined();
        // The id specifically. The domain module hands it straight to a query
        // filter, so an id that differs from the seeded one silently returns
        // an empty category page rather than an error.
        expect(row!.id).toBe(category.id);
        expect(row!.name).toBe(category.name);
      }
    });

    it("has no category in the table that the domain list does not know", async () => {
      const rows = await db!.select({ slug: categories.slug }).from(categories);
      const curated = new Set<string>(PRODUCT_CATEGORIES.map((c) => c.slug));

      // A row the list does not know is unreachable: /categories/[slug]
      // resolves from the domain module, so this row would be counted on the
      // index page and 404 when clicked.
      for (const row of rows) {
        expect(curated.has(row.slug), `unknown category in table: ${row.slug}`).toBe(
          true
        );
      }
    });
  });

  describe("assigning a category", () => {
    it("files a product under a curated category", async () => {
      const created = await createProduct({
        repository: repository!,
        ownerId,
        name: `Categorised ${unique("c")}`,
        failureStatus: "ABANDONED",
        categorySlug: "developer-tools",
      });
      createdProductIds.push(created.id);

      const [row] = await db!
        .select({ categoryId: products.categoryId })
        .from(products)
        .where(eq(products.id, created.id));

      expect(row!.categoryId).toBe(
        PRODUCT_CATEGORIES.find((c) => c.slug === "developer-tools")!.id
      );
    });

    it("rejects a category that is not on the list", async () => {
      // Not a silent null. A product filed under a category that does not
      // exist would vanish from every category page with nothing to explain it.
      await expect(
        createProduct({
          repository: repository!,
          ownerId,
          name: `Bad Category ${unique("c")}`,
          failureStatus: "ABANDONED",
          categorySlug: "not-a-real-category",
        })
      ).rejects.toThrow(ProductError);
    });

    it("allows no category at all", async () => {
      const created = await createProduct({
        repository: repository!,
        ownerId,
        name: `Uncategorised ${unique("c")}`,
        failureStatus: "ABANDONED",
      });
      createdProductIds.push(created.id);

      const [row] = await db!
        .select({ categoryId: products.categoryId })
        .from(products)
        .where(eq(products.id, created.id));

      expect(row!.categoryId).toBeNull();
    });
  });

  describe("category counts", () => {
    it("excludes unpublished and moderated products from the count", async () => {
      const before = await repository!.countPublicByCategory();
      const fintechBefore =
        before.find((row) => row.slug === "fintech")?.productCount ?? 0;

      // One of each state that must not be counted, plus one that must be.
      const draft = await createProduct({
        repository: repository!,
        ownerId,
        name: `Fintech Draft ${unique("c")}`,
        failureStatus: "ABANDONED",
        categorySlug: "fintech",
      });
      createdProductIds.push(draft.id);

      const hidden = await createProduct({
        repository: repository!,
        ownerId,
        name: `Fintech Hidden ${unique("c")}`,
        failureStatus: "ABANDONED",
        categorySlug: "fintech",
      });
      createdProductIds.push(hidden.id);
      await db!
        .update(products)
        .set({
          publicationState: "PUBLISHED",
          publishedAt: new Date(),
          moderationState: "HIDDEN",
        })
        .where(eq(products.id, hidden.id));

      const visible = await createProduct({
        repository: repository!,
        ownerId,
        name: `Fintech Live ${unique("c")}`,
        failureStatus: "ABANDONED",
        categorySlug: "fintech",
      });
      createdProductIds.push(visible.id);
      await db!
        .update(products)
        .set({ publicationState: "PUBLISHED", publishedAt: new Date() })
        .where(eq(products.id, visible.id));

      const after = await repository!.countPublicByCategory();
      const fintechAfter =
        after.find((row) => row.slug === "fintech")?.productCount ?? 0;

      // Three products created, exactly one countable. A count that includes
      // the draft or the hidden one advertises listings nobody can open.
      expect(fintechAfter).toBe(fintechBefore + 1);
    });

    it("reports every curated category, including the empty ones", async () => {
      const rows = await repository!.countPublicByCategory();

      // A LEFT JOIN, not an inner one: an empty category is a true statement
      // about the directory, and dropping the row would say the category does
      // not exist.
      expect(rows.length).toBe(PRODUCT_CATEGORIES.length);
      for (const row of rows) {
        expect(row.productCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("filtering by category", () => {
    it("returns only publicly visible products in that category", async () => {
      const live = await createProduct({
        repository: repository!,
        ownerId,
        name: `Games Live ${unique("c")}`,
        failureStatus: "ABANDONED",
        categorySlug: "games",
      });
      createdProductIds.push(live.id);
      await db!
        .update(products)
        .set({ publicationState: "PUBLISHED", publishedAt: new Date() })
        .where(eq(products.id, live.id));

      const removed = await createProduct({
        repository: repository!,
        ownerId,
        name: `Games Removed ${unique("c")}`,
        failureStatus: "ABANDONED",
        categorySlug: "games",
      });
      createdProductIds.push(removed.id);
      await db!
        .update(products)
        .set({
          publicationState: "PUBLISHED",
          publishedAt: new Date(),
          moderationState: "REMOVED",
        })
        .where(eq(products.id, removed.id));

      const page = await listPublicDirectory({
        repository: repository!,
        categoryId: PRODUCT_CATEGORIES.find((c) => c.slug === "games")!.id,
        pageSize: 48,
      });
      const slugs = page.items.map((item) => item.slug);

      expect(slugs).toContain(live.slug);
      expect(slugs).not.toContain(removed.slug);
    });

    it("carries the category through to the card", async () => {
      const created = await createProduct({
        repository: repository!,
        ownerId,
        name: `Health Card ${unique("c")}`,
        failureStatus: "ABANDONED",
        categorySlug: "health",
      });
      createdProductIds.push(created.id);
      await db!
        .update(products)
        .set({ publicationState: "PUBLISHED", publishedAt: new Date() })
        .where(eq(products.id, created.id));

      const page = await listPublicDirectory({
        repository: repository!,
        categoryId: PRODUCT_CATEGORIES.find((c) => c.slug === "health")!.id,
        pageSize: 48,
      });
      const item = page.items.find((row) => row.id === created.id);

      // Joined, not fetched per row: a page of 24 cards each loading its own
      // category is the N+1 ENGINEERING.md §5 forbids.
      expect(item?.categorySlug).toBe("health");
      expect(item?.categoryName).toBe("Health");
    });
  });
});
