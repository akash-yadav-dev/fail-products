// tests/integration/product-service.test.ts
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { products, users } from "@/db/schema";
import { ProductRepository } from "@/repositories/product-repository";
import {
  ProductError,
  changeFailureStatus,
  changeModerationState,
  changePublicationState,
  createProduct,
  resolvePublicProduct,
  updateProduct,
} from "@/services/product/product-service";
import { noDatabase, testDb, unique } from "./database";

/**
 * The product use cases against a real database.
 *
 * Constraints are proven by violating them (tests/02-testing.md): a unique
 * index is not demonstrated by an insert that works, it is demonstrated by the
 * duplicate that fails.
 */

describe.skipIf(noDatabase)("product service", () => {
  const db = noDatabase ? null : testDb();
  const repository = noDatabase ? null : new ProductRepository(db!);
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];

  async function owner() {
    const handle = unique("psowner");
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

  async function make(ownerId: string, name: string, extra = {}) {
    const created = await createProduct({
      repository: repository!,
      ownerId,
      name,
      failureStatus: "ABANDONED",
      ...extra,
    });
    createdProductIds.push(created.id);
    return created;
  }

  afterAll(async () => {
    if (!db) return;
    if (createdProductIds.length > 0) {
      // product_status_history and product_slug_history cascade or null out.
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  describe("creation", () => {
    it("creates a draft with a slug derived from the name", async () => {
      const ownerId = await owner();
      const created = await make(ownerId, "Totally Unique Widget Factory");

      expect(created.slug).toMatch(/^totally-unique-widget-factory/);

      const [row] = await db!
        .select()
        .from(products)
        .where(eq(products.id, created.id));

      // A new product is never born public.
      expect(row!.publicationState).toBe("DRAFT");
      expect(row!.moderationState).toBe("NONE");
      expect(row!.publishedAt).toBeNull();
    });

    it("gives a second product with the same name a different slug", async () => {
      const ownerId = await owner();
      const name = `Collide ${unique("x")}`;

      const first = await make(ownerId, name);
      const second = await make(ownerId, name);

      expect(second.slug).not.toBe(first.slug);
      expect(second.slug).toBe(`${first.slug}-2`);
    });

    it("writes the opening history rows with a null previous value", async () => {
      const ownerId = await owner();
      const created = await make(ownerId, `History ${unique("h")}`);

      const history = await repository!.listStatusHistory(created.id);
      const axes = history.map((row) => row.axis).sort();

      expect(axes).toEqual(["FAILURE", "PUBLICATION"]);
      // Null `fromValue` is what distinguishes a creation from a transition.
      expect(history.every((row) => row.fromValue === null)).toBe(true);
      expect(history.every((row) => row.actorId === ownerId)).toBe(true);
    });

    it("rejects a website URL that is not http or https", async () => {
      const ownerId = await owner();
      await expect(
        createProduct({
          repository: repository!,
          ownerId,
          name: `Bad URL ${unique("u")}`,
          failureStatus: "ABANDONED",
          websiteUrl: "javascript:alert(1)",
        })
      ).rejects.toThrow(ProductError);
    });

    it("rejects an empty name", async () => {
      const ownerId = await owner();
      await expect(
        createProduct({
          repository: repository!,
          ownerId,
          name: "   ",
          failureStatus: "ABANDONED",
        })
      ).rejects.toThrow(ProductError);
    });
  });

  describe("renaming and slug history (ADR-019)", () => {
    it("retires the old slug and keeps it resolving", async () => {
      const ownerId = await owner();
      const created = await make(ownerId, `Before ${unique("r")}`);
      const originalSlug = created.slug;

      const renamed = await updateProduct({
        repository: repository!,
        viewer: { userId: ownerId },
        productId: created.id,
        name: `After ${unique("r")}`,
      });

      expect(renamed.slug).not.toBe(originalSlug);

      // The old URL still resolves — to a redirect, not a 404.
      const resolved = await resolvePublicProduct(repository!, originalSlug);
      expect(resolved).toEqual({ kind: "moved", slug: renamed.slug });
    });

    it("refuses to reissue a retired slug to another product", async () => {
      const ownerId = await owner();
      const name = `Reuse ${unique("q")}`;
      const created = await make(ownerId, name);
      const originalSlug = created.slug;

      await updateProduct({
        repository: repository!,
        viewer: { userId: ownerId },
        productId: created.id,
        name: `Moved ${unique("q")}`,
      });

      // A new product with the original name must not inherit the retired slug,
      // or it inherits the other product's inbound links too.
      const second = await make(ownerId, name);
      expect(second.slug).not.toBe(originalSlug);
      expect(await repository!.isSlugAvailable(originalSlug)).toBe(false);
    });

    it("does not move the slug when the name is unchanged", async () => {
      const ownerId = await owner();
      const created = await make(ownerId, `Stable ${unique("s")}`);

      const result = await updateProduct({
        repository: repository!,
        viewer: { userId: ownerId },
        productId: created.id,
        tagline: "An edit that is not a rename",
      });

      // An indexed URL must not change because someone fixed a typo elsewhere.
      expect(result.slug).toBe(created.slug);
    });
  });

  describe("authorization", () => {
    it("refuses an edit by a different signed-in user", async () => {
      const ownerId = await owner();
      const strangerId = await owner();
      const created = await make(ownerId, `Guarded ${unique("g")}`);

      await expect(
        updateProduct({
          repository: repository!,
          viewer: { userId: strangerId },
          productId: created.id,
          name: "Hijacked",
        })
      ).rejects.toThrow("Not found");
    });

    it("refuses a publish by a different signed-in user", async () => {
      const ownerId = await owner();
      const strangerId = await owner();
      const created = await make(ownerId, `Guarded ${unique("g")}`);

      await expect(
        changePublicationState({
          repository: repository!,
          viewer: { userId: strangerId },
          productId: created.id,
          to: "PUBLISHED",
        })
      ).rejects.toThrow("Not found");
    });

    it("refuses an anonymous visitor", async () => {
      const ownerId = await owner();
      const created = await make(ownerId, `Guarded ${unique("g")}`);

      await expect(
        updateProduct({
          repository: repository!,
          viewer: { userId: null },
          productId: created.id,
          name: "Hijacked",
        })
      ).rejects.toThrow("Not found");
    });
  });

  describe("publication", () => {
    it("stamps publishedAt on the first publish only", async () => {
      const ownerId = await owner();
      const created = await make(ownerId, `Publish ${unique("p")}`);
      const viewer = { userId: ownerId };

      await changePublicationState({
        repository: repository!,
        viewer,
        productId: created.id,
        to: "PUBLISHED",
      });
      const [first] = await db!
        .select({ publishedAt: products.publishedAt })
        .from(products)
        .where(eq(products.id, created.id));

      await changePublicationState({
        repository: repository!,
        viewer,
        productId: created.id,
        to: "DRAFT",
      });
      await changePublicationState({
        repository: repository!,
        viewer,
        productId: created.id,
        to: "PUBLISHED",
      });
      const [second] = await db!
        .select({ publishedAt: products.publishedAt })
        .from(products)
        .where(eq(products.id, created.id));

      // It records when the listing first became public, not the latest publish.
      expect(second!.publishedAt).toEqual(first!.publishedAt);
    });

    it("rejects an illegal transition", async () => {
      const ownerId = await owner();
      const created = await make(ownerId, `Illegal ${unique("i")}`);
      const viewer = { userId: ownerId };

      await changePublicationState({
        repository: repository!,
        viewer,
        productId: created.id,
        to: "PUBLISHED",
      });

      // A live listing must not re-enter the review queue.
      await expect(
        changePublicationState({
          repository: repository!,
          viewer,
          productId: created.id,
          to: "PENDING_REVIEW",
        })
      ).rejects.toThrow(ProductError);
    });
  });

  describe("axis independence (ADR-013)", () => {
    it("a moderation change leaves failure status and publication untouched", async () => {
      const ownerId = await owner();
      const moderatorId = await owner();
      const created = await make(ownerId, `Axes ${unique("a")}`);

      await changePublicationState({
        repository: repository!,
        viewer: { userId: ownerId },
        productId: created.id,
        to: "PUBLISHED",
      });

      const [before] = await db!
        .select()
        .from(products)
        .where(eq(products.id, created.id));

      await changeModerationState({
        repository: repository!,
        viewer: { userId: moderatorId, isModerator: true },
        productId: created.id,
        to: "HIDDEN",
        reason: "Integration test",
      });

      const [after] = await db!
        .select()
        .from(products)
        .where(eq(products.id, created.id));

      expect(after!.moderationState).toBe("HIDDEN");
      // The two columns the moderator must not have touched.
      expect(after!.failureStatus).toBe(before!.failureStatus);
      expect(after!.publicationState).toBe(before!.publicationState);
    });

    it("a failure status change leaves moderation untouched", async () => {
      const ownerId = await owner();
      const moderatorId = await owner();
      const created = await make(ownerId, `Axes ${unique("a")}`);

      await changeModerationState({
        repository: repository!,
        viewer: { userId: moderatorId, isModerator: true },
        productId: created.id,
        to: "FLAGGED",
        reason: "Integration test",
      });

      await changeFailureStatus({
        repository: repository!,
        viewer: { userId: ownerId },
        productId: created.id,
        to: "RECOVERING",
      });

      const [after] = await db!
        .select()
        .from(products)
        .where(eq(products.id, created.id));

      // Published and flagged, or recovering and flagged, are legal states.
      expect(after!.failureStatus).toBe("RECOVERING");
      expect(after!.moderationState).toBe("FLAGGED");
    });

    it("refuses an owner attempting to moderate their own listing", async () => {
      const ownerId = await owner();
      const created = await make(ownerId, `SelfMod ${unique("m")}`);

      await expect(
        changeModerationState({
          repository: repository!,
          viewer: { userId: ownerId },
          productId: created.id,
          to: "NONE",
          reason: "Trying to clear my own flag",
        })
      ).rejects.toThrow("Not found");
    });

    it("records a moderation reason on the timeline", async () => {
      const ownerId = await owner();
      const moderatorId = await owner();
      const created = await make(ownerId, `Reason ${unique("w")}`);

      await changeModerationState({
        repository: repository!,
        viewer: { userId: moderatorId, isModerator: true },
        productId: created.id,
        to: "HIDDEN",
        reason: "Spam report upheld",
      });

      const history = await repository!.listStatusHistory(created.id);
      const moderation = history.find((row) => row.axis === "MODERATION");

      // A takedown with no recorded reason cannot be reviewed or appealed.
      expect(moderation?.reason).toBe("Spam report upheld");
      expect(moderation?.actorRole).toBe("MODERATOR");
      expect(moderation?.fromValue).toBe("NONE");
      expect(moderation?.toValue).toBe("HIDDEN");
    });
  });

  describe("public resolution", () => {
    it("does not resolve a draft", async () => {
      const ownerId = await owner();
      const created = await make(ownerId, `Hidden ${unique("d")}`);

      expect(await resolvePublicProduct(repository!, created.slug)).toEqual({
        kind: "missing",
      });
    });

    it("resolves a published product", async () => {
      const ownerId = await owner();
      const created = await make(ownerId, `Live ${unique("l")}`);

      await changePublicationState({
        repository: repository!,
        viewer: { userId: ownerId },
        productId: created.id,
        to: "PUBLISHED",
      });

      const resolved = await resolvePublicProduct(repository!, created.slug);
      expect(resolved.kind).toBe("found");
    });

    it("stops resolving once hidden by a moderator", async () => {
      const ownerId = await owner();
      const moderatorId = await owner();
      const created = await make(ownerId, `Pulled ${unique("z")}`);

      await changePublicationState({
        repository: repository!,
        viewer: { userId: ownerId },
        productId: created.id,
        to: "PUBLISHED",
      });
      await changeModerationState({
        repository: repository!,
        viewer: { userId: moderatorId, isModerator: true },
        productId: created.id,
        to: "HIDDEN",
        reason: "Integration test",
      });

      expect(await resolvePublicProduct(repository!, created.slug)).toEqual({
        kind: "missing",
      });
    });

    it("still resolves a published product that is merely flagged", async () => {
      const ownerId = await owner();
      const moderatorId = await owner();
      const created = await make(ownerId, `Flagged ${unique("f")}`);

      await changePublicationState({
        repository: repository!,
        viewer: { userId: ownerId },
        productId: created.id,
        to: "PUBLISHED",
      });
      await changeModerationState({
        repository: repository!,
        viewer: { userId: moderatorId, isModerator: true },
        productId: created.id,
        to: "FLAGGED",
        reason: "Under review",
      });

      // docs/PRODUCT.md §6: a flag is a visible signal, not a removal.
      const resolved = await resolvePublicProduct(repository!, created.slug);
      expect(resolved.kind).toBe("found");
    });

    it("returns missing for a slug that never existed", async () => {
      expect(
        await resolvePublicProduct(repository!, unique("never-existed"))
      ).toEqual({ kind: "missing" });
    });
  });
});
