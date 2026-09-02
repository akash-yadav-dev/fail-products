// tests/integration/comment-visibility.test.ts
import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";

import { comments, products, users } from "@/db/schema";
import { CommentRepository } from "@/repositories/comment-repository";
import { RateLimitRepository } from "@/repositories/rate-limit-repository";
import {
  CommentError,
  listComments,
  postComment,
} from "@/services/comment/comment-service";
import { DatabaseRateLimiter } from "@/services/security/rate-limit";
import type { CommentModerationState } from "@/domain/comment/moderation";
import { noDatabase, testDb, unique } from "./database";

/**
 * What a public comment query may return.
 *
 * The same shape as `product-visibility.test.ts`, and for the same reason: the
 * successful case proves nothing on its own. Each test below inserts a row that
 * must not come back and asserts it does not.
 *
 * Two independent filters have to hold — the comment's own moderation state and
 * the product's visibility — and the second is the one a reviewer forgets. A
 * comment on a listing that was hidden after the discussion happened is still
 * in the table, still VISIBLE, and still about a page nobody may see.
 */

describe.skipIf(noDatabase)("publicly visible comments", () => {
  const db = noDatabase ? null : testDb();
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];

  function repository() {
    return new CommentRepository(db!);
  }

  async function account() {
    const handle = unique("commenter");
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

  async function product(state: Partial<typeof products.$inferInsert> = {}) {
    const [row] = await db!
      .insert(products)
      .values({
        ownerId: await account(),
        slug: unique("comment-fixture"),
        name: "Comment fixture",
        failureStatus: "ABANDONED",
        publicationState: "PUBLISHED",
        moderationState: "NONE",
        publishedAt: new Date(),
        ...state,
      })
      .returning();

    createdProductIds.push(row!.id);
    return row!;
  }

  async function comment(
    productId: string,
    authorId: string,
    moderationState: CommentModerationState = "VISIBLE"
  ) {
    const [row] = await db!
      .insert(comments)
      .values({
        productId,
        authorId,
        body: "The onboarding lost me on step three.",
        moderationState,
      })
      .returning();

    return row!;
  }

  /** The ids a public read of this product's discussion returns. */
  async function visibleIds(productId: string): Promise<string[]> {
    const page = await listComments({ repository: repository(), productId });
    return page.items.map((item) => item.id);
  }

  afterAll(async () => {
    if (!db) return;
    // Comments cascade with their product; products may outlive their owner as
    // anonymous records, so the users go last.
    if (createdProductIds.length) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  it("returns a visible comment on a published product", async () => {
    const listing = await product();
    const row = await comment(listing.id, await account());

    await expect(visibleIds(listing.id)).resolves.toEqual([row.id]);
  });

  it.each(["PENDING", "HIDDEN", "REMOVED"] as const)(
    "excludes a %s comment",
    async (state) => {
      const listing = await product();
      await comment(listing.id, await account(), state);

      await expect(visibleIds(listing.id)).resolves.toEqual([]);
    }
  );

  it("excludes a visible comment on a hidden product", async () => {
    // The case the comment filter alone would leak. The comment was fine; the
    // page it belongs to is not.
    const listing = await product({ moderationState: "HIDDEN" });
    await comment(listing.id, await account());

    await expect(visibleIds(listing.id)).resolves.toEqual([]);
  });

  it("excludes a visible comment on a removed product", async () => {
    const listing = await product({ moderationState: "REMOVED" });
    await comment(listing.id, await account());

    await expect(visibleIds(listing.id)).resolves.toEqual([]);
  });

  it("excludes a visible comment on a draft product", async () => {
    const listing = await product({
      publicationState: "DRAFT",
      publishedAt: null,
    });
    await comment(listing.id, await account());

    await expect(visibleIds(listing.id)).resolves.toEqual([]);
  });

  it("excludes a visible comment on an archived product", async () => {
    const listing = await product({ publicationState: "ARCHIVED" });
    await comment(listing.id, await account());

    await expect(visibleIds(listing.id)).resolves.toEqual([]);
  });

  it("counts only what the list would show", async () => {
    // The count and the list must agree. A heading saying "3 comments" above
    // one visible row tells a reader that two were removed, which is a
    // moderation disclosure nobody decided to make.
    const listing = await product();
    await comment(listing.id, await account(), "VISIBLE");
    await comment(listing.id, await account(), "HIDDEN");
    await comment(listing.id, await account(), "REMOVED");

    await expect(
      repository().countPublicForProduct(listing.id)
    ).resolves.toBe(1);
  });

  it("orders a discussion oldest first", async () => {
    const listing = await product();
    const first = await comment(listing.id, await account());
    const second = await comment(listing.id, await account());

    await expect(visibleIds(listing.id)).resolves.toEqual([
      first.id,
      second.id,
    ]);
  });
});

describe.skipIf(noDatabase)("posting a comment", () => {
  const db = noDatabase ? null : testDb();
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];

  function repository() {
    return new CommentRepository(db!);
  }

  function rateLimiter() {
    return new DatabaseRateLimiter(new RateLimitRepository(db!));
  }

  async function account() {
    const handle = unique("poster");
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

  async function product(state: Partial<typeof products.$inferInsert> = {}) {
    const [row] = await db!
      .insert(products)
      .values({
        ownerId: await account(),
        slug: unique("post-fixture"),
        name: "Post fixture",
        failureStatus: "ABANDONED",
        publicationState: "PUBLISHED",
        moderationState: "NONE",
        publishedAt: new Date(),
        ...state,
      })
      .returning();

    createdProductIds.push(row!.id);
    return row!;
  }

  afterAll(async () => {
    if (!db) return;
    if (createdProductIds.length) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  it("stores a comment and returns the product slug to revalidate", async () => {
    const listing = await product();
    const author = await account();

    const posted = await postComment({
      repository: repository(),
      rateLimiter: rateLimiter(),
      viewer: { userId: author },
      productId: listing.id,
      body: "  I used this for a month.  ",
    });

    expect(posted.productSlug).toBe(listing.slug);

    const page = await listComments({
      repository: repository(),
      productId: listing.id,
    });
    expect(page.items[0]!.body).toBe("I used this for a month.");
  });

  it("refuses a signed-out visitor", async () => {
    const listing = await product();

    await expect(
      postComment({
        repository: repository(),
        rateLimiter: rateLimiter(),
        viewer: { userId: null },
        productId: listing.id,
        body: "anonymous",
      })
    ).rejects.toMatchObject({ code: "NOT_SIGNED_IN" });
  });

  it.each([
    ["hidden", { moderationState: "HIDDEN" as const }],
    ["removed", { moderationState: "REMOVED" as const }],
    ["draft", { publicationState: "DRAFT" as const, publishedAt: null }],
    ["archived", { publicationState: "ARCHIVED" as const }],
  ])("refuses to comment on a %s listing", async (_label, state) => {
    // And refuses it the same way it refuses an id that does not exist, so the
    // form cannot be used to probe for unpublished listings.
    const listing = await product(state);

    await expect(
      postComment({
        repository: repository(),
        rateLimiter: rateLimiter(),
        viewer: { userId: await account() },
        productId: listing.id,
        body: "should not land",
      })
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("gives the same answer for a product id that does not exist", async () => {
    await expect(
      postComment({
        repository: repository(),
        rateLimiter: rateLimiter(),
        viewer: { userId: await account() },
        productId: "00000000-0000-7000-8000-000000000000",
        body: "should not land",
      })
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("rejects an empty body before it reaches the database", async () => {
    const listing = await product();

    await expect(
      postComment({
        repository: repository(),
        rateLimiter: rateLimiter(),
        viewer: { userId: await account() },
        productId: listing.id,
        body: "   \n  ",
      })
    ).rejects.toMatchObject({ code: "EMPTY" });
  });

  it("stops an account that posts faster than the limit allows", async () => {
    const listing = await product();
    const author = await account();
    const limiter = rateLimiter();

    // The rule allows ten in ten minutes. The eleventh must be refused with a
    // usable error rather than a 500 — the Phase 3 plan asks for exactly that.
    const results: string[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      try {
        await postComment({
          repository: repository(),
          rateLimiter: limiter,
          viewer: { userId: author },
          productId: listing.id,
          body: `attempt ${attempt}`,
        });
        results.push("posted");
      } catch (error) {
        results.push(
          error instanceof CommentError ? error.code : "unexpected"
        );
      }
    }

    expect(results.filter((entry) => entry === "posted")).toHaveLength(10);
    expect(results.at(-1)).toBe("RATE_LIMITED");
  });
});
