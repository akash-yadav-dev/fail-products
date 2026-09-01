// tests/integration/product-search.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { products, users } from "@/db/schema";
import { ProductRepository } from "@/repositories/product-repository";
import {
  createProduct,
  listPublicDirectory,
} from "@/services/product/product-service";
import { noDatabase, testDb, unique } from "./database";

/**
 * Full-text search, against a real Postgres.
 *
 * The plan says not to build this over an empty table, because full-text search
 * over nothing proves nothing. So this suite writes a small realistic corpus —
 * products whose names, taglines, and descriptions differ in the ways that
 * decide a match — and asserts against that.
 *
 * What it cannot prove is relevance *quality* on a real corpus. Ranking is
 * tuned against the seeded directory in Phase 4.5, not here; what is proven
 * here is that matching works, that weighting orders a name above a passing
 * mention, and that no state filter leaks.
 */

describe.skipIf(noDatabase)("product search", () => {
  const db = noDatabase ? null : testDb();
  const repository = noDatabase ? null : new ProductRepository(db!);

  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];

  /** A nonsense token no other row in the branch can contain. */
  const token = `zqxwv${Math.random().toString(36).slice(2, 8)}`;
  let ownerId: string;

  async function publish(input: {
    name: string;
    tagline?: string;
    description?: string;
  }) {
    const created = await createProduct({
      repository: repository!,
      ownerId,
      name: input.name,
      tagline: input.tagline ?? null,
      description: input.description ?? null,
      failureStatus: "ABANDONED",
    });
    createdProductIds.push(created.id);

    await db!
      .update(products)
      .set({ publicationState: "PUBLISHED", publishedAt: new Date() })
      .where(eq(products.id, created.id));

    return created;
  }

  beforeAll(async () => {
    if (!db) return;
    const handle = unique("searchowner");
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

  describe("matching", () => {
    it("finds a product by a word in its name", async () => {
      const created = await publish({
        name: `Kanban ${token} Board`,
        tagline: "Cards in columns, for the fifth time.",
      });

      const page = await listPublicDirectory({
        repository: repository!,
        search: token,
      });

      expect(page.items.map((item) => item.slug)).toContain(created.slug);
    });

    it("finds a product by a word only in its description", async () => {
      const marker = `${token}desc`;
      const created = await publish({
        name: `Unrelated Name ${unique("s")}`,
        description: `The founder wrote at length about ${marker} and what it cost them.`,
      });

      const page = await listPublicDirectory({
        repository: repository!,
        search: marker,
      });

      expect(page.items.map((item) => item.slug)).toContain(created.slug);
    });

    it("matches an inflected form through the english stemmer", async () => {
      const marker = `${token}stem`;
      const created = await publish({
        name: `Analytics ${marker} Reporting`,
        description: "It reported nothing anyone wanted to read.",
      });

      // 'reporting' stems to 'report'. Without a stemmed configuration this
      // search would find nothing, which is the difference between a search box
      // and an exact-match filter.
      const page = await listPublicDirectory({
        repository: repository!,
        search: `${marker} report`,
      });

      expect(page.items.map((item) => item.slug)).toContain(created.slug);
    });

    it("ranks a name match above a passing mention in a description", async () => {
      const marker = `${token}rank`;
      const inName = await publish({ name: `${marker} Primary` });
      const inBody = await publish({
        name: `Secondary ${unique("s")}`,
        description: `We briefly considered ${marker} before giving up.`,
      });

      const page = await listPublicDirectory({
        repository: repository!,
        search: marker,
      });
      const slugs = page.items.map((item) => item.slug);

      // setweight puts the name in band A and the description in band C. If the
      // weights were dropped, these two would rank arbitrarily.
      expect(slugs.indexOf(inName.slug)).toBeLessThan(slugs.indexOf(inBody.slug));
    });
  });

  describe("state filtering", () => {
    it("never returns a hidden product", async () => {
      // The most direct possible leak: a search takes a text query rather than
      // a guessed URL, so a missing state filter here is trivially exploitable.
      const marker = `${token}hidden`;
      const created = await publish({ name: `${marker} Suppressed` });
      await db!
        .update(products)
        .set({ moderationState: "HIDDEN" })
        .where(eq(products.id, created.id));

      const page = await listPublicDirectory({
        repository: repository!,
        search: marker,
      });

      expect(page.items.map((item) => item.slug)).not.toContain(created.slug);
    });

    it("never returns a removed product", async () => {
      const marker = `${token}removed`;
      const created = await publish({ name: `${marker} Deleted` });
      await db!
        .update(products)
        .set({ moderationState: "REMOVED" })
        .where(eq(products.id, created.id));

      const page = await listPublicDirectory({
        repository: repository!,
        search: marker,
      });

      expect(page.items.map((item) => item.slug)).not.toContain(created.slug);
    });

    it("never returns a draft", async () => {
      const marker = `${token}draft`;
      const created = await createProduct({
        repository: repository!,
        ownerId,
        name: `${marker} Unpublished`,
        failureStatus: "ABANDONED",
      });
      createdProductIds.push(created.id);

      const page = await listPublicDirectory({
        repository: repository!,
        search: marker,
      });

      expect(page.items.map((item) => item.slug)).not.toContain(created.slug);
    });

    it("never returns an archived product", async () => {
      const marker = `${token}archived`;
      const created = await publish({ name: `${marker} Retired` });
      await db!
        .update(products)
        .set({ publicationState: "ARCHIVED" })
        .where(eq(products.id, created.id));

      const page = await listPublicDirectory({
        repository: repository!,
        search: marker,
      });

      expect(page.items.map((item) => item.slug)).not.toContain(created.slug);
    });
  });

  describe("hostile and empty input", () => {
    it("falls back to the full directory for a blank query", async () => {
      const searched = await listPublicDirectory({
        repository: repository!,
        search: "   ",
      });
      const browsed = await listPublicDirectory({ repository: repository! });

      // Not "no results". A blank box has not asked for anything.
      expect(searched.search).toBeNull();
      expect(searched.items.map((i) => i.id)).toEqual(
        browsed.items.map((i) => i.id)
      );
    });

    it("does not raise on input that would break to_tsquery", async () => {
      // to_tsquery('english', 'a & & b') throws. A thrown query on a public
      // search box is a 500 anyone can trigger by typing, which is why the
      // repository uses websearch_to_tsquery instead.
      const hostile = [
        "a & & b",
        "!!!",
        '"unclosed phrase',
        "a | | b",
        "'; drop table products; --",
        "()",
        "<script>alert(1)</script>",
        "\\",
        "%",
        "a:*",
        "*".repeat(200),
      ];

      for (const term of hostile) {
        await expect(
          listPublicDirectory({ repository: repository!, search: term }),
          term
        ).resolves.toBeDefined();
      }
    });

    it("bounds the result set and says when it is capped", async () => {
      const page = await listPublicDirectory({
        repository: repository!,
        search: token,
        pageSize: 2,
      });

      // Search returns one bounded page with no cursor. `truncated` is what
      // lets the page say so instead of silently hiding the rest.
      expect(page.items.length).toBeLessThanOrEqual(2);
      expect(page.nextCursor).toBeNull();
      expect(typeof page.truncated).toBe("boolean");
    });

    it("clamps a request for the entire table through the search path too", async () => {
      const page = await listPublicDirectory({
        repository: repository!,
        search: token,
        pageSize: 100_000,
      });

      expect(page.items.length).toBeLessThanOrEqual(48);
    });
  });

  describe("composition with filters", () => {
    it("combines a search with a status filter", async () => {
      const marker = `${token}combo`;
      const abandoned = await publish({ name: `${marker} Abandoned One` });

      const recovering = await createProduct({
        repository: repository!,
        ownerId,
        name: `${marker} Recovering One`,
        failureStatus: "RECOVERING",
      });
      createdProductIds.push(recovering.id);
      await db!
        .update(products)
        .set({ publicationState: "PUBLISHED", publishedAt: new Date() })
        .where(eq(products.id, recovering.id));

      const page = await listPublicDirectory({
        repository: repository!,
        search: marker,
        failureStatus: "RECOVERING",
      });
      const slugs = page.items.map((item) => item.slug);

      expect(slugs).toContain(recovering.slug);
      expect(slugs).not.toContain(abandoned.slug);
    });
  });
});
