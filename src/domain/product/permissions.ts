// src/domain/product/permissions.ts
/**
 * Who may do what to a product (ADR-012 — listings are owner-only).
 *
 * Every verb is decided here, in one place, from a server-loaded owner id and a
 * server-loaded session id. `AGENTS.md` §7 is explicit that authorization
 * re-loads the record server-side and compares against the **session**, never
 * against an owner id that arrived with the request — a client-supplied
 * `owner_id` is an assertion by the caller, not a fact.
 *
 * Domain code imports nothing from Next.js, React, or any provider.
 */

/** Every mutating action a product supports. Exhaustive on purpose. */
export const PRODUCT_VERBS = [
  "view",
  "edit",
  "publish",
  "unpublish",
  "archive",
  "delete",
  "moderate",
  "upload_image",
  "export_waitlist",
] as const;

export type ProductVerb = (typeof PRODUCT_VERBS)[number];

export type ProductSubject = {
  /** Null once the owning account is deleted; the listing survives anonymously. */
  readonly ownerId: string | null;
  readonly publicationState: string;
  readonly moderationState: string;
};

export type Viewer = {
  /** Null when signed out. Never read from a form field. */
  readonly userId: string | null;
  readonly isModerator?: boolean;
};

/**
 * Whether `viewer` may perform `verb` on `product`.
 *
 * Written as a single exhaustive switch rather than a permission table so the
 * compiler fails the build when a verb is added and left undecided. A verb that
 * silently falls through to "allowed" is the failure this shape prevents.
 */
export function can(
  viewer: Viewer,
  verb: ProductVerb,
  product: ProductSubject
): boolean {
  const isModerator = viewer.isModerator === true;

  // An anonymised listing has no owner to authorise against. It is not
  // ownerless-therefore-editable: it is ownerless-therefore-frozen.
  const isOwner =
    viewer.userId !== null &&
    product.ownerId !== null &&
    viewer.userId === product.ownerId;

  switch (verb) {
    case "view":
      // The public predicate lives in the repository, because it must be a SQL
      // filter rather than a post-fetch check. This covers the private case:
      // an owner and a moderator can always see their own or any listing.
      return (
        isOwner ||
        isModerator ||
        (product.publicationState === "PUBLISHED" &&
          product.moderationState !== "HIDDEN" &&
          product.moderationState !== "REMOVED")
      );

    case "edit":
    case "publish":
    case "unpublish":
    case "archive":
    case "delete":
    case "upload_image":
      // Owner-only, and a moderator is deliberately excluded. A moderator has
      // the moderation axis; editing someone else's listing would let the site
      // alter a founder's own account of what happened (ADR-013).
      return isOwner;

    case "export_waitlist":
      // Its own verb, and owner-only with the moderator excluded **more**
      // firmly than above. A waitlist export is bulk personal data belonging to
      // third parties who consented to hear from this founder and from nobody
      // else (`docs/SECURITY.md` §11, `docs/LEGAL.md` §5). Moderation is a
      // content power; it is not a reason to hold a list of strangers' email
      // addresses, and folding this into `edit` would have granted it to
      // whoever `edit` is granted to next.
      return isOwner;

    case "moderate":
      // And the converse: an owner cannot moderate their own listing.
      return isModerator;
  }
}

/** Asserting form, for the service layer. Throws rather than returning false. */
export class ProductAccessError extends Error {
  constructor(readonly verb: ProductVerb) {
    // Deliberately uninformative: an authorization message must not reveal
    // whether the record exists (docs/SECURITY.md).
    super("Not found");
    this.name = "ProductAccessError";
  }
}

export function authorize(
  viewer: Viewer,
  verb: ProductVerb,
  product: ProductSubject
): void {
  if (!can(viewer, verb, product)) {
    throw new ProductAccessError(verb);
  }
}
