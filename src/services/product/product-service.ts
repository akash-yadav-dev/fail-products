// src/services/product/product-service.ts
import {
  findCategoryBySlug,
  isProductCategorySlug,
} from "@/domain/product/category";
import type { FailureStatus } from "@/domain/product/failure-status";
import {
  decodeProductCursor,
  encodeProductCursor,
  parsePageSize,
  parseProductSort,
  type ProductSort,
} from "@/domain/product/listing";
import { authorize, type Viewer } from "@/domain/product/permissions";
import { parseSearchQuery } from "@/domain/product/search";
import { slugCandidates } from "@/domain/product/slug";
import {
  canTransitionFailureStatus,
  canTransitionModeration,
  canTransitionPublication,
  type ModerationState,
  type PublicationState,
} from "@/domain/product/transitions";
import { uuidv7 } from "@/lib/ids/uuid-v7";
import { normaliseExternalUrl } from "@/lib/validation/url";
import type { ProductRepository } from "@/repositories/product-repository";

/**
 * Product use cases.
 *
 * Every mutation follows the order `ENGINEERING.md` requires:
 * parse → validate → authenticate → authorize → domain → persist → safe
 * response. The repository is injected rather than imported so these run
 * against a test database without a framework anywhere near them.
 */

export type ProductServiceError =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_NAME"
  | "INVALID_URL"
  | "INVALID_CATEGORY"
  | "ILLEGAL_TRANSITION"
  | "SLUG_EXHAUSTED";

export class ProductError extends Error {
  constructor(readonly code: ProductServiceError) {
    super(code);
    this.name = "ProductError";
  }
}

/** Matches `varchar(120)` on `products.name`. */
const MAX_NAME_LENGTH = 120;
const MAX_TAGLINE_LENGTH = 200;

function parseName(input: string): string {
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    throw new ProductError("INVALID_NAME");
  }
  return name;
}

function parseOptionalText(input: string | null | undefined, max: number) {
  const value = input?.trim();
  if (!value) return null;
  return value.slice(0, max);
}

/**
 * A URL that is either absent or safe. An unsafe one is an error, not a silent
 * null — quietly discarding what someone typed looks like the form lost it.
 */
function parseWebsiteUrl(input: string | null | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;

  const normalised = normaliseExternalUrl(raw);
  if (!normalised) throw new ProductError("INVALID_URL");
  return normalised;
}

/**
 * The category id for a submitted slug, or null when none was chosen.
 *
 * Resolved against the curated list in the domain module rather than by
 * querying the table, because the list is what defines the taxonomy (ADR-026) —
 * the table is its copy. A slug that is not on the list is an error, not a
 * silent null: a product filed under a category that does not exist would
 * vanish from every category page with nothing to explain it.
 *
 * `docs/SECURITY.md` §4 lists category IDs among the values to validate. A
 * `<select>` is a suggestion; the request is a form post like any other.
 */
function parseCategorySlug(input: string | null | undefined): string | null {
  const slug = input?.trim();
  if (!slug) return null;
  if (!isProductCategorySlug(slug)) throw new ProductError("INVALID_CATEGORY");
  return findCategoryBySlug(slug)!.id;
}

/**
 * Creates a product as a draft.
 *
 * The slug loop walks the candidate list, skipping anything already taken in
 * either namespace, and treats a lost insert race as an ordinary retry rather
 * than an error — two people naming a product the same thing at the same moment
 * is the case this exists for, not an exception.
 */
export async function createProduct(input: {
  repository: ProductRepository;
  ownerId: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  categorySlug?: string | null;
  failureStatus: FailureStatus;
}) {
  const name = parseName(input.name);
  const websiteUrl = parseWebsiteUrl(input.websiteUrl);
  const tagline = parseOptionalText(input.tagline, MAX_TAGLINE_LENGTH);
  const description = parseOptionalText(input.description, 20_000);
  const categoryId = parseCategorySlug(input.categorySlug);

  for (const candidate of slugCandidates(name)) {
    if (!(await input.repository.isSlugAvailable(candidate))) continue;

    const created = await input.repository.createAtSlug({
      ownerId: input.ownerId,
      slug: candidate,
      name,
      tagline,
      description,
      websiteUrl,
      categoryId,
      failureStatus: input.failureStatus,
    });

    // Null means another writer took the slug between the check and the
    // insert. Try the next candidate.
    if (!created) continue;

    // The opening rows of the audit trail. `fromValue` is null because there
    // was no previous state — that is what makes a creation distinguishable
    // from a transition when the timeline is read back.
    await input.repository.recordStatusChange({
      productId: created.id,
      axis: "PUBLICATION",
      fromValue: null,
      toValue: "DRAFT",
      actorId: input.ownerId,
      actorRole: "OWNER",
    });
    await input.repository.recordStatusChange({
      productId: created.id,
      axis: "FAILURE",
      fromValue: null,
      toValue: input.failureStatus,
      actorId: input.ownerId,
      actorRole: "OWNER",
    });

    return created;
  }

  // Every candidate was taken. Far more likely a bug than real contention, so
  // it fails loudly rather than looping forever.
  throw new ProductError("SLUG_EXHAUSTED");
}

/**
 * Edits a product's details.
 *
 * A rename retires the old slug and moves to a new one (ADR-019) so the
 * previous URL keeps resolving. The slug only changes when the name does; an
 * edit to the tagline must not silently rewrite a URL that is already indexed.
 */
export async function updateProduct(input: {
  repository: ProductRepository;
  viewer: Viewer;
  productId: string;
  name?: string;
  tagline?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
}) {
  const product = await input.repository.findForAuthorization(input.productId);
  if (!product) throw new ProductError("NOT_FOUND");
  authorize(input.viewer, "edit", product);

  const fields: Record<string, unknown> = {};

  if (input.name !== undefined) fields.name = parseName(input.name);
  if (input.websiteUrl !== undefined) {
    fields.websiteUrl = parseWebsiteUrl(input.websiteUrl);
  }
  if (input.tagline !== undefined) {
    fields.tagline = parseOptionalText(input.tagline, MAX_TAGLINE_LENGTH);
  }
  if (input.description !== undefined) {
    fields.description = parseOptionalText(input.description, 20_000);
  }

  await input.repository.updateDetails(input.productId, fields);

  const renamed = typeof fields.name === "string" && fields.name !== product.name;
  if (!renamed) return { id: input.productId, slug: product.slug };

  for (const candidate of slugCandidates(fields.name as string)) {
    if (candidate === product.slug) return { id: input.productId, slug: product.slug };
    if (!(await input.repository.isSlugAvailable(candidate))) continue;

    // One atomic statement: the product moves and the old slug is reserved
    // together, or neither happens. Doing it in two would leave a window where
    // the old URL is free for another product to claim (ADR-019).
    const moved = await input.repository.renameSlug({
      productId: input.productId,
      oldSlug: product.slug,
      newSlug: candidate,
      historyId: uuidv7(),
    });
    if (moved) return moved;
  }

  // Keep the existing slug rather than failing the edit. The name change is
  // still saved; the URL simply does not follow it.
  return { id: input.productId, slug: product.slug };
}

/** Owner-driven publication change, recorded on the timeline. */
export async function changePublicationState(input: {
  repository: ProductRepository;
  viewer: Viewer;
  productId: string;
  to: PublicationState;
}) {
  const product = await input.repository.findForAuthorization(input.productId);
  if (!product) throw new ProductError("NOT_FOUND");

  const verb = input.to === "PUBLISHED" ? "publish" : "unpublish";
  authorize(input.viewer, verb, product);

  const from = product.publicationState as PublicationState;
  const allowed = canTransitionPublication(from, input.to, "OWNER");
  if (!allowed.ok) throw new ProductError("ILLEGAL_TRANSITION");

  await input.repository.setPublicationState(
    input.productId,
    input.to,
    // Stamped only on the first publish: it records when the listing first
    // became public, not when it was most recently republished.
    input.to === "PUBLISHED" && product.publishedAt === null ? new Date() : undefined
  );

  await input.repository.recordStatusChange({
    productId: input.productId,
    axis: "PUBLICATION",
    fromValue: from,
    toValue: input.to,
    actorId: input.viewer.userId,
    actorRole: "OWNER",
  });

  return { id: input.productId, publicationState: input.to };
}

/**
 * Moderator-driven moderation change.
 *
 * Touches `moderation_state` and nothing else. The product's factual status and
 * its owner's publication decision are left exactly as they were — that
 * separation is the whole point of ADR-013.
 */
export async function changeModerationState(input: {
  repository: ProductRepository;
  viewer: Viewer;
  productId: string;
  to: ModerationState;
  reason: string;
}) {
  const product = await input.repository.findForAuthorization(input.productId);
  if (!product) throw new ProductError("NOT_FOUND");
  authorize(input.viewer, "moderate", product);

  const from = product.moderationState as ModerationState;
  const allowed = canTransitionModeration(from, input.to, "MODERATOR");
  if (!allowed.ok) throw new ProductError("ILLEGAL_TRANSITION");

  await input.repository.setModerationState(input.productId, input.to);

  await input.repository.recordStatusChange({
    productId: input.productId,
    axis: "MODERATION",
    fromValue: from,
    toValue: input.to,
    actorId: input.viewer.userId,
    actorRole: "MODERATOR",
    // Required for moderation, unlike the other axes: a takedown with no
    // recorded reason cannot be reviewed or appealed.
    reason: input.reason,
  });

  return { id: input.productId, moderationState: input.to };
}

/** Owner-driven factual status change. Never touches the other two axes. */
export async function changeFailureStatus(input: {
  repository: ProductRepository;
  viewer: Viewer;
  productId: string;
  to: FailureStatus;
}) {
  const product = await input.repository.findForAuthorization(input.productId);
  if (!product) throw new ProductError("NOT_FOUND");
  authorize(input.viewer, "edit", product);

  const from = product.failureStatus as FailureStatus;
  const allowed = canTransitionFailureStatus(from, input.to, "OWNER");
  if (!allowed.ok) throw new ProductError("ILLEGAL_TRANSITION");

  await input.repository.setFailureStatus(input.productId, input.to);

  await input.repository.recordStatusChange({
    productId: input.productId,
    axis: "FAILURE",
    fromValue: from,
    toValue: input.to,
    actorId: input.viewer.userId,
    actorRole: "OWNER",
  });

  return { id: input.productId, failureStatus: input.to };
}

/**
 * Resolves a public product URL.
 *
 * Three outcomes, because the page needs to tell them apart: the product, a
 * permanent redirect to its current slug, or nothing. Returning null for a
 * retired slug would 404 a URL that search engines have already indexed.
 */
export async function resolvePublicProduct(
  repository: ProductRepository,
  slug: string
): Promise<
  | { kind: "found"; product: NonNullable<Awaited<ReturnType<ProductRepository["findPublicBySlug"]>>> }
  | { kind: "moved"; slug: string }
  | { kind: "missing" }
> {
  const product = await repository.findPublicBySlug(slug);
  if (product) return { kind: "found", product };

  const retired = await repository.findByRetiredSlug(slug);
  if (retired && retired.currentSlug !== slug) {
    return { kind: "moved", slug: retired.currentSlug };
  }

  return { kind: "missing" };
}

/**
 * One page of the public directory, and the cursor for the next one.
 *
 * Every public list goes through here: `/products`, `/status/[slug]`,
 * `/categories/[slug]`, and search differ only in the filters they pass. The
 * parameters arrive as `unknown` because they come from a query string, and
 * each is parsed by the domain module rather than trusted — an unvalidated
 * sort chooses a column and an unvalidated limit chooses how much of the table
 * an anonymous request may read.
 */
export async function listPublicDirectory(input: {
  repository: ProductRepository;
  sort?: unknown;
  cursor?: unknown;
  pageSize?: unknown;
  search?: unknown;
  failureStatus?: FailureStatus;
  categoryId?: string;
}) {
  const sort = parseProductSort(input.sort);
  const cursor = decodeProductCursor(input.cursor);
  const limit = parsePageSize(input.pageSize);
  const search = parseSearchQuery(input.search);

  // A search is a different query, not a filtered browse: ranked instead of
  // chronological, and one bounded page instead of a keyset walk. Branching
  // here keeps the cursor from being a parameter that silently does nothing.
  if (search) {
    const items = await input.repository.searchPublic({
      term: search,
      limit,
      filters: {
        failureStatus: input.failureStatus,
        categoryId: input.categoryId,
      },
    });

    return { items, sort, search, nextCursor: null, truncated: items.length >= limit };
  }

  // One more row than the page shows. That extra row is the whole answer to "is
  // there another page?", so the alternative — a second COUNT over the same
  // predicate — is a query billed for information this one already has.
  const rows = await input.repository.listPublic({
    limit: limit + 1,
    sort,
    cursor,
    filters: {
      failureStatus: input.failureStatus,
      categoryId: input.categoryId,
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  // The position to resume from is the sort column of the last row shown.
  const sortedAt =
    sort === "recently-updated" ? last?.updatedAt : last?.publishedAt;

  return {
    items,
    sort,
    search,
    truncated: false,
    // `publishedAt` is non-null on every publicly visible row — migration 0005
    // makes that a CHECK constraint rather than a convention — so this guard is
    // the type system's price for the column being nullable in general, not a
    // silent truncation of the list.
    nextCursor:
      hasMore && last && sortedAt
        ? encodeProductCursor({ sortedAt, id: last.id })
        : null,
  };
}

export type PublicDirectoryPage = Awaited<
  ReturnType<typeof listPublicDirectory>
>;
export type { ProductSort };
