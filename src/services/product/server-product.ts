// src/services/product/server-product.ts
import { getDb } from "@/db";
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

export function listPublicDirectory(
  input: Without<Parameters<typeof listPublicDirectoryUseCase>[0]> = {}
) {
  return listPublicDirectoryUseCase({ ...input, repository: repository() });
}

export function listCategoriesWithCounts() {
  return repository().countPublicByCategory();
}

export function findCategoryBySlug(slug: string) {
  return repository().findCategoryBySlug(slug);
}

export function listStatusHistory(productId: string) {
  return repository().listStatusHistory(productId);
}
