// tests/e2e/fixtures/seed-product.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray } from "drizzle-orm";

import * as schema from "@/db/schema";
import { products, users } from "@/db/schema";
import { ProductRepository } from "@/repositories/product-repository";
import {
  changePublicationState,
  createProduct,
  updateProduct,
} from "@/services/product/product-service";

/**
 * A real published product for the browser to open.
 *
 * The Phase 2 plan's E2E for slice 2.2 is "open a product from the list, follow
 * the breadcrumb back". That cannot be faked: the whole point of the test is
 * that the list query, the detail lookup, and the breadcrumb agree about a row
 * that actually exists. So the spec seeds one, uses it, and deletes it.
 *
 * Written through the service rather than straight into the table, because the
 * service is what stamps `published_at` — and migration 0005 makes a PUBLISHED
 * row without one illegal. A raw insert would be a fixture the application
 * itself could never produce.
 */

export type SeededProduct = {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  ownerUsername: string;
};

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

/** Unique per call, so the two viewport projects never share a row. */
function unique(prefix: string) {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

export async function seedPublishedProduct(): Promise<SeededProduct> {
  const database = db();
  const repository = new ProductRepository(database);

  const handle = unique("e2eowner");
  const [owner] = await database
    .insert(users)
    .values({
      username: handle,
      usernameLower: handle.toLowerCase(),
      email: `${handle}@example.test`,
    })
    .returning();

  const name = `E2E Listing ${unique("p")}`;
  const created = await createProduct({
    repository,
    ownerId: owner!.id,
    name,
    tagline: "A product that ran out of runway before it ran out of ideas.",
    description:
      "The founder shipped for eight months and never found a repeatable channel.\n\nThis text exists so the detail page has a narrative section to render.",
    websiteUrl: "https://example.com/",
    failureStatus: "ABANDONED",
  });

  await changePublicationState({
    repository,
    viewer: { userId: owner!.id },
    productId: created.id,
    to: "PUBLISHED",
  });

  return {
    id: created.id,
    slug: created.slug,
    name,
    ownerId: owner!.id,
    ownerUsername: handle,
  };
}

/**
 * A published product whose previous slug has been retired.
 *
 * The rename happens **while the product is still a draft**, and the reason is
 * a race that only shows up in the full suite. `/products/[slug]` is
 * prerendered with a five-minute window (ADR-027), and Next prefetches the
 * links it can see — so any concurrent visitor to `/products` warms the cache
 * for a published product's card, and a slug retired afterwards keeps serving
 * the cached 200 instead of the redirect. Renaming before the listing is ever
 * public means nothing has had a card to prefetch, so the redirect is the only
 * thing the old URL has ever returned.
 *
 * That staleness is real behaviour rather than a test artefact — a rename
 * through the application invalidates both paths (`server-product.ts`), which
 * this fixture cannot do from outside the server process.
 */
export async function seedProductWithRetiredSlug(): Promise<
  SeededProduct & { oldSlug: string }
> {
  const database = db();
  const repository = new ProductRepository(database);

  const handle = unique("e2eowner");
  const [owner] = await database
    .insert(users)
    .values({
      username: handle,
      usernameLower: handle.toLowerCase(),
      email: `${handle}@example.test`,
    })
    .returning();

  const created = await createProduct({
    repository,
    ownerId: owner!.id,
    name: `E2E Renamed ${unique("before")}`,
    tagline: "It changed its name after launch, as products do.",
    websiteUrl: "https://example.com/",
    failureStatus: "ABANDONED",
  });

  const name = `E2E Renamed ${unique("after")}`;
  const moved = await updateProduct({
    repository,
    viewer: { userId: owner!.id },
    productId: created.id,
    name,
  });

  if (moved.slug === created.slug) {
    throw new Error("The rename did not retire a slug; the fixture is broken.");
  }

  await changePublicationState({
    repository,
    viewer: { userId: owner!.id },
    productId: created.id,
    to: "PUBLISHED",
  });

  return {
    id: created.id,
    slug: moved.slug,
    oldSlug: created.slug,
    name,
    ownerId: owner!.id,
    ownerUsername: handle,
  };
}

export async function removeSeededProduct(seeded: SeededProduct) {
  const database = db();
  // product_slug_history.product_id is ON DELETE SET NULL, so the retired slug
  // stays reserved after the product goes — which is exactly ADR-019's rule and
  // means this cleanup cannot free a slug for reuse.
  await database.delete(products).where(eq(products.id, seeded.id));
  await database.delete(users).where(inArray(users.id, [seeded.ownerId]));
}
