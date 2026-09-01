// tests/integration/product-listing.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { products, users } from "@/db/schema";
import type { FailureStatus } from "@/domain/product/failure-status";
import { ProductRepository } from "@/repositories/product-repository";
import {
  createProduct,
  listPublicDirectory,
} from "@/services/product/product-service";
import { noDatabase, testDb, unique } from "./database";

/**
 * The public list query, against a real database.
 *
 * The plan calls this the rule most likely to leak, and it is: a public list
 * has to filter on `publication_state` **and** `moderation_state` (ADR-013),
 * and forgetting either one publishes something nobody agreed to publish.
 * There is one test per state rather than one test covering all of them,
 * because a combined test that fails names four suspects instead of one.
 */

describe.skipIf(noDatabase)("public product listing", () => {
  const db = noDatabase ? null : testDb();
  const repository = noDatabase ? null : new ProductRepository(db!);

  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];

  /** Scopes every assertion to this run's rows, not whatever else is in the branch. */
  const marker = unique("listing");
  let ownerId: string;

  async function make(
    name: string,
    state: {
      publicationState?: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "ARCHIVED";
      moderationState?: "NONE" | "FLAGGED" | "HIDDEN" | "REMOVED";
      publishedAt?: Date;
      failureStatus?: FailureStatus;
    } = {}
  ) {
    const created = await createProduct({
      repository: repository!,
      ownerId,
      name: `${name} ${marker}`,
      failureStatus: state.failureStatus ?? "ABANDONED",
    });
    createdProductIds.push(created.id);

    const publicationState = state.publicationState ?? "PUBLISHED";
    await db!
      .update(products)
      .set({
        publicationState,
        moderationState: state.moderationState ?? "NONE",
        // Migration 0005 makes this an invariant: PUBLISHED implies a
        // published_at. Setting it here is what keeps the fixture legal.
        publishedAt:
          publicationState === "PUBLISHED"
            ? (state.publishedAt ?? new Date())
            : null,
      })
      .where(eq(products.id, created.id));

    return created;
  }

  /** Only the rows this file created, so a shared branch cannot skew a count. */
  async function visibleSlugs(input: Parameters<typeof listPublicDirectory>[0]) {
    const page = await listPublicDirectory(input);
    return {
      ...page,
      slugs: page.items
        .filter((item) => createdProductIds.includes(item.id))
        .map((item) => item.slug),
    };
  }

  beforeAll(async () => {
    if (!db) return;
    const handle = unique("listowner");
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

  // ---------------------------------------------------------------------------
  // One test per state that must never reach a public page.
  // ---------------------------------------------------------------------------

  describe("state filtering", () => {
    it("includes a published, unmoderated product", async () => {
      // The control. Without it, a query that returns nothing at all would pass
      // every one of the exclusion tests below.
      const created = await make("Visible Control");
      const { slugs } = await visibleSlugs({ repository: repository! });

      expect(slugs).toContain(created.slug);
    });

    it("excludes a draft", async () => {
      const created = await make("Draft Only", { publicationState: "DRAFT" });
      const { slugs } = await visibleSlugs({ repository: repository! });

      expect(slugs).not.toContain(created.slug);
    });

    it("excludes an archived product", async () => {
      const created = await make("Archived Away", {
        publicationState: "ARCHIVED",
      });
      const { slugs } = await visibleSlugs({ repository: repository! });

      expect(slugs).not.toContain(created.slug);
    });

    it("excludes a hidden product", async () => {
      // Published by its owner, hidden by a moderator. This is the case a
      // single-column status model gets wrong, and the reason ADR-013 exists.
      const created = await make("Hidden Product", {
        publicationState: "PUBLISHED",
        moderationState: "HIDDEN",
      });
      const { slugs } = await visibleSlugs({ repository: repository! });

      expect(slugs).not.toContain(created.slug);
    });

    it("excludes a removed product", async () => {
      const created = await make("Removed Product", {
        publicationState: "PUBLISHED",
        moderationState: "REMOVED",
      });
      const { slugs } = await visibleSlugs({ repository: repository! });

      expect(slugs).not.toContain(created.slug);
    });

    it("still includes a flagged product", async () => {
      // `docs/PRODUCT.md` §6 is explicit: a flag is a visible moderation
      // signal, not a takedown. Filtering it out would quietly delete listings
      // that were only ever meant to carry a warning.
      const created = await make("Flagged But Public", {
        moderationState: "FLAGGED",
      });
      const { slugs } = await visibleSlugs({ repository: repository! });

      expect(slugs).toContain(created.slug);
    });
  });

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  describe("cursor pagination", () => {
    it("is stable across pages when the sort keys are all equal", async () => {
      // The failure mode this exists for: every row shares a timestamp, so the
      // sort column alone cannot order them and the page boundary is where a
      // row gets repeated or dropped. The id tiebreak is what prevents it.
      //
      // RECOVERING is used by no other test in this file, so filtering on it
      // walks these six rows rather than everything else the suite published.
      const tied = new Date("2026-07-04T00:00:00.000Z");
      const names = ["Tie A", "Tie B", "Tie C", "Tie D", "Tie E", "Tie F"];
      const expected: string[] = [];
      for (const name of names) {
        const created = await make(name, {
          publishedAt: tied,
          failureStatus: "RECOVERING",
        });
        expected.push(created.id);
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      // Walks to the end rather than a fixed number of pages, so the test also
      // proves the cursor terminates instead of paging forever.
      for (let page = 0; page < 40; page += 1) {
        const result = await listPublicDirectory({
          repository: repository!,
          failureStatus: "RECOVERING",
          pageSize: 2,
          cursor,
        });

        seen.push(...result.items.map((item) => item.id));

        cursor = result.nextCursor;
        if (!cursor) break;
      }

      expect(cursor).toBeNull();

      // No repeats: a row on two pages is the same bug as a row on none, and
      // only one of the two is visible to a reader.
      expect(new Set(seen).size).toBe(seen.length);

      // And every tied row was reached, exactly once each.
      for (const id of expected) {
        expect(seen).toContain(id);
      }
    });

    it("stops offering a cursor at the end of the list", async () => {
      const page = await listPublicDirectory({
        repository: repository!,
        pageSize: 48,
      });

      // Fewer rows than the page size means there is no next page, and offering
      // a cursor anyway produces an empty page the reader has to click into.
      if (page.items.length < 48) {
        expect(page.nextCursor).toBeNull();
      }
    });

    it("ignores a malformed cursor instead of failing the page", async () => {
      const first = await listPublicDirectory({ repository: repository! });
      const garbage = await listPublicDirectory({
        repository: repository!,
        cursor: "'; drop table products; --",
      });

      expect(garbage.items.map((item) => item.id)).toEqual(
        first.items.map((item) => item.id)
      );
    });

    it("never returns more rows than the page size", async () => {
      const page = await listPublicDirectory({
        repository: repository!,
        pageSize: 3,
      });

      // The query fetches limit + 1 to detect a next page. Returning that extra
      // row would render a page one item longer than the caller asked for.
      expect(page.items.length).toBeLessThanOrEqual(3);
    });

    it("clamps a request for the entire table", async () => {
      const page = await listPublicDirectory({
        repository: repository!,
        pageSize: 100_000,
      });

      expect(page.items.length).toBeLessThanOrEqual(48);
    });
  });

  // ---------------------------------------------------------------------------
  // Sorting and filters
  // ---------------------------------------------------------------------------

  describe("sorting", () => {
    it("orders newest first by publication date", async () => {
      // STRUGGLING is used by no other test in this file, so filtering on it
      // scopes the assertion to these two rows.
      //
      // Without that scope this test is flaky, and was: the fixtures are
      // published in January and June while every other suite publishes at
      // `now`, so once the shared branch held more than a page of recent rows
      // these two fell off page one and both indexOf calls returned -1. A test
      // whose result depends on how much unrelated data happens to exist is not
      // testing the sort.
      const older = await make("Sorted Older", {
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        failureStatus: "STRUGGLING",
      });
      const newer = await make("Sorted Newer", {
        publishedAt: new Date("2026-06-01T00:00:00.000Z"),
        failureStatus: "STRUGGLING",
      });

      const page = await listPublicDirectory({
        repository: repository!,
        sort: "newest",
        failureStatus: "STRUGGLING",
        pageSize: 48,
      });
      const slugs = page.items.map((item) => item.slug);

      expect(slugs).toContain(newer.slug);
      expect(slugs).toContain(older.slug);
      expect(slugs.indexOf(newer.slug)).toBeLessThan(slugs.indexOf(older.slug));
    });

    it("falls back to the default sort rather than failing on an unknown one", async () => {
      const page = await listPublicDirectory({
        repository: repository!,
        sort: "published_at; drop table products",
      });

      expect(page.sort).toBe("newest");
    });

    it("orders by last edit when asked for recently updated", async () => {
      const page = await listPublicDirectory({
        repository: repository!,
        sort: "recently-updated",
        pageSize: 48,
      });

      expect(page.sort).toBe("recently-updated");

      const timestamps = page.items.map((item) => item.updatedAt.getTime());
      const descending = [...timestamps].sort((a, b) => b - a);
      expect(timestamps).toEqual(descending);
    });
  });

  describe("filters", () => {
    it("narrows to one failure status without losing the state filters", async () => {
      const created = await createProduct({
        repository: repository!,
        ownerId,
        name: `Shut Down Thing ${marker}`,
        failureStatus: "SHUT_DOWN",
      });
      createdProductIds.push(created.id);
      await db!
        .update(products)
        .set({ publicationState: "PUBLISHED", publishedAt: new Date() })
        .where(eq(products.id, created.id));

      const hidden = await createProduct({
        repository: repository!,
        ownerId,
        name: `Shut Down Hidden ${marker}`,
        failureStatus: "SHUT_DOWN",
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

      const page = await listPublicDirectory({
        repository: repository!,
        failureStatus: "SHUT_DOWN",
        pageSize: 48,
      });
      const slugs = page.items.map((item) => item.slug);

      expect(slugs).toContain(created.slug);
      // A filter is not a replacement for the visibility predicate. This is the
      // shape of the leak: a new surface adds a WHERE and drops the other two.
      expect(slugs).not.toContain(hidden.slug);
      expect(
        page.items.every((item) => item.failureStatus === "SHUT_DOWN")
      ).toBe(true);
    });
  });
});
