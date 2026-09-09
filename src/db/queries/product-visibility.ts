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

/**
 * The weaker predicate: a listing the public has been shown, whatever a
 * moderator has since done to it.
 *
 * `publiclyVisibleProduct` answers "may this be rendered now". This answers
 * "was this ever public", and the two must not be confused. A listing that is
 * HIDDEN or REMOVED still has to be reachable by the report and appeal path —
 * `docs/MODERATION.md` §10 promises an appeal, and an appeal filed against a
 * takedown is filed after the takedown. Filtering that path on present
 * visibility drops exactly the reports the appeal is about.
 *
 * What it still excludes is a listing that was never published. A DRAFT is
 * private to its owner, so a lookup that confirms one exists — or reveals the
 * slug it was renamed to — is an enumeration oracle, not an appeal.
 */
export const publishedProduct: SQL = eq(products.publicationState, "PUBLISHED");
