// src/db/queries/product-visibility.ts
import { and, eq, or, type SQL } from "drizzle-orm";

import { products } from "@/db/schema/products";

/**
 * The predicate every public product query must carry.
 *
 * ADR-013 splits publication and moderation into separate columns precisely so
 * they can disagree — and warns that "every list query filters on
 * `publication_state` and `moderation_state`; forgetting one leaks hidden
 * content, so the repository layer must make the safe default the easy one."
 *
 * This is that safe default. It exists as one exported expression rather than
 * being retyped per query so a new list cannot ship with half the filter.
 *
 * `docs/PRODUCT.md` §6 is explicit: a flag is a visible moderation signal;
 * only HIDDEN and REMOVED take a published product off the public surface.
 */
export const publiclyVisibleProduct: SQL = and(
  eq(products.publicationState, "PUBLISHED"),
  or(
    eq(products.moderationState, "NONE"),
    eq(products.moderationState, "FLAGGED")
  )
)!;
