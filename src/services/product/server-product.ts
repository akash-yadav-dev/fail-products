// src/services/product/server-product.ts
import { getDb } from "@/db";
import { canSkipDatabaseAtBuild } from "@/lib/config/database";
import { ProductRepository } from "@/repositories/product-repository";
import {
  changeFailureStatus as changeFailureStatusUseCase,
  changeModerationState as changeModerationStateUseCase,
  changePublicationState as changePublicationStateUseCase,
  createProduct as createProductUseCase,
  listPublicDirectory as listPublicDirectoryUseCase,
  resolvePublicProduct as resolvePublicProductUseCase,
  updateProduct as updateProductUseCase,
} from "@/services/product/product-service";

/**
 * The server-side binding for the product use cases.
 *
 * Pages and Server Actions call these; the use cases themselves stay free of
 * `getDb` so tests can supply their own database. Mirrors
 * `src/services/auth/server-auth.ts`.
 */

function repository() {
  return new ProductRepository(getDb());
}

type Without<T> = Omit<T, "repository">;

export function createProduct(
  input: Without<Parameters<typeof createProductUseCase>[0]>
) {
  return createProductUseCase({ ...input, repository: repository() });
}

export function updateProduct(
  input: Without<Parameters<typeof updateProductUseCase>[0]>
) {
  return updateProductUseCase({ ...input, repository: repository() });
}

export function changePublicationState(
  input: Without<Parameters<typeof changePublicationStateUseCase>[0]>
) {
  return changePublicationStateUseCase({ ...input, repository: repository() });
}

export function changeModerationState(
  input: Without<Parameters<typeof changeModerationStateUseCase>[0]>
) {
  return changeModerationStateUseCase({ ...input, repository: repository() });
}

export function changeFailureStatus(
  input: Without<Parameters<typeof changeFailureStatusUseCase>[0]>
) {
  return changeFailureStatusUseCase({ ...input, repository: repository() });
}

export function resolvePublicProduct(slug: string) {
  return resolvePublicProductUseCase(repository(), slug);
}

export function listOwnedProducts(ownerId: string) {
  return repository().listByOwner(ownerId);
}

/**
 * One page of the public directory.
 *
 * The build guard lives here rather than in each page because every prerendered
 * list calls this — `/categories/[slug]` and `/status/[slug]` since ADR-027 made
 * them static, and `/products/[slug]` for its related listings. CI builds with
 * no `DATABASE_URL` on purpose (`.github/workflows/ci.yml`), and a guard a page
 * has to remember is a guard the next page forgets. An empty page is the honest
 * answer during a build with no database; at runtime the missing variable still
 * throws, because a deployed site quietly rendering "nothing here" is the silent
 * failure `docs/ENGINEERING.md` §1.9 forbids.
 */
export function listPublicDirectory(
  input: Without<Parameters<typeof listPublicDirectoryUseCase>[0]> = {}
) {
  if (canSkipDatabaseAtBuild()) {
    return Promise.resolve({
      items: [],
      sort: "newest" as const,
      search: null,
      truncated: false,
      nextCursor: null,
    });
  }

  return listPublicDirectoryUseCase({ ...input, repository: repository() });
}

export function listCategoriesWithCounts() {
  return repository().countPublicByCategory();
}

export function findCategoryBySlug(slug: string) {
  return repository().findCategoryBySlug(slug);
}

/**
 * Every indexable product URL.
 *
 * The bound is stated here rather than left to the caller so no sitemap build
 * can accidentally ask for the whole table. 5,000 is far above the directory's
 * near-term size and far below the 50,000-URL limit a sitemap file has, so it
 * will need revisiting long before either becomes a problem.
 */
export function listProductsForSitemap(limit = 5_000) {
  return repository().listAllPublicForSitemap(limit);
}

export function listStatusHistory(productId: string) {
  return repository().listStatusHistory(productId);
}
