// src/domain/product/slug.ts
import { isReservedName } from "@/domain/shared/reserved-names";

/**
 * Slug generation (ADR-019).
 *
 * Slugs are the product's permanent identity in search. They are generated
 * once, retired into `product_slug_history` when they change, and never reused
 * across products — so getting the shape right at creation matters more than it
 * looks, because the mistakes are not correctable later without discarding
 * inbound links.
 *
 * Domain code imports nothing from Next.js, React, or any provider.
 */

/** Matches `varchar(96)` on `products.slug`. Truncation happens here, not at the database. */
export const MAX_SLUG_LENGTH = 96;

/**
 * Used when a name normalises to nothing at all.
 *
 * A product named entirely in a script with no ASCII transliteration — "日本語",
 * "Продукт", an emoji — is a real submission, not an error. It gets a working
 * URL and the owner can rename it; refusing the listing would be worse.
 */
export const FALLBACK_SLUG = "untitled";

/**
 * A name reduced to a URL-safe slug.
 *
 * NFKD then stripping the combining range is what turns "Café" into "cafe"
 * rather than "caf": the decomposition separates the base letter from its
 * accent, and only the accent is dropped.
 */
export function slugify(input: string): string {
  const ascii = input
    .normalize("NFKD")
    // The Unicode combining diacritical marks block, left behind by NFKD.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Everything that is not a-z0-9 becomes a separator, including the
    // characters that survive normalisation from other scripts.
    .replace(/[^a-z0-9]+/g, "-");

  return trimHyphens(ascii).slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "");
}

function trimHyphens(value: string): string {
  return value.replace(/^-+/, "").replace(/-+$/, "");
}

/**
 * `base` with a numeric discriminator, kept inside the length cap.
 *
 * The base is truncated rather than the suffix, because a truncated suffix
 * stops disambiguating — "really-long-name-1" and "really-long-name-1" for
 * attempts 12 and 13 would collide forever.
 */
function withSuffix(base: string, n: number): string {
  const suffix = `-${n}`;
  const room = MAX_SLUG_LENGTH - suffix.length;
  return `${trimHyphens(base.slice(0, room))}${suffix}`;
}

/**
 * The slugs to try for a name, in order, best first.
 *
 * Returned rather than yielded lazily so the caller cannot accidentally loop
 * forever against a database that says "taken" to everything.
 *
 * Reserved names never appear in the list (ADR-019). A product called "Status"
 * therefore gets `status-2`, not `status` — the reserved word is skipped, not
 * decorated, so the result still reads like the product's name.
 *
 * Uniqueness against existing rows is *not* decided here. That needs the
 * database, and it must consider retired slugs too, so it belongs to the
 * repository.
 */
export function slugCandidates(name: string, limit = 100): string[] {
  const base = slugify(name) || FALLBACK_SLUG;
  const candidates: string[] = [];

  if (!isReservedName(base)) {
    candidates.push(base);
  }

  for (let n = 2; candidates.length < limit; n += 1) {
    const candidate = withSuffix(base, n);
    if (!isReservedName(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

/** Whether a slug is one this application could have generated. */
export function isValidSlug(slug: string): boolean {
  return (
    slug.length > 0 &&
    slug.length <= MAX_SLUG_LENGTH &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
    !isReservedName(slug)
  );
}
