// src/domain/product/listing.ts
/**
 * The rules the public directory list obeys.
 *
 * Slice 2.1 of the Phase 2 plan: every public list — `/products`,
 * `/categories/[slug]`, `/status/[slug]`, and search — reuses this, so the sort
 * allowlist and the cursor format are defined once and cannot drift apart.
 *
 * Domain code imports nothing from Next.js, React, Drizzle, or any provider.
 */

/**
 * The sorts a visitor may ask for.
 *
 * `docs/PRODUCT.md` §5.1 lists four under Discovery: newest, recently updated,
 * most discussed, and most referred. Only two are here, and the omission is
 * deliberate rather than an oversight:
 *
 * - **most discussed** counts comments. The `comments` table is Phase 3 and
 *   does not exist; there is no column to order by.
 * - **most referred** counts outbound referral events. Referral tracking is
 *   Phase 4 and does not exist either.
 *
 * Shipping either one now would mean ordering by a number the system cannot
 * compute, which is a lie rendered as a control. They join this list in the
 * phase that gives them a data source, and the allowlist is what makes adding
 * them a one-line change.
 */
export const PRODUCT_SORTS = [
  {
    value: "newest",
    label: "Newest",
    /** Ordered by when the listing first became public. */
    description: "Most recently published first.",
  },
  {
    value: "recently-updated",
    label: "Recently updated",
    /** Ordered by the last edit, so a revived postmortem resurfaces. */
    description: "Most recently edited first.",
  },
] as const;

export type ProductSortDefinition = (typeof PRODUCT_SORTS)[number];
export type ProductSort = ProductSortDefinition["value"];

export const DEFAULT_PRODUCT_SORT: ProductSort = "newest";

/**
 * Whether a string is one of the allowed sorts.
 *
 * The strict half of the pair. Nothing that is not in `PRODUCT_SORTS` ever
 * reaches a query, which is the point: a sort parameter chooses a column, and
 * an unchecked one chooses whatever the attacker typed.
 */
export function isProductSort(input: unknown): input is ProductSort {
  return (
    typeof input === "string" &&
    PRODUCT_SORTS.some((sort) => sort.value === input)
  );
}

/**
 * The sort to actually use for a request.
 *
 * Falls back to the default instead of throwing, because this parses a URL
 * query string. `?sort=nonsense` is a visitor with a stale bookmark far more
 * often than an attack, and 404-ing a browse page over it helps nobody. The
 * rejection still happens — the unknown value never reaches the query.
 */
export function parseProductSort(input: unknown): ProductSort {
  return isProductSort(input) ? input : DEFAULT_PRODUCT_SORT;
}

/** How many cards a page shows when nothing asks for otherwise. */
export const DEFAULT_PAGE_SIZE = 24;

/**
 * The ceiling on one page.
 *
 * `ENGINEERING.md` §5 requires bounded queries. Without a maximum, `?limit=1e6`
 * is an unauthenticated request to read the whole table — cheap to send and
 * metered to serve, which is the wrong side of that trade on Neon.
 */
export const MAX_PAGE_SIZE = 48;

/**
 * Clamps a requested page size into the bounded range. Never throws.
 *
 * `Number`, not `Number.parseInt`. `parseInt` reads a prefix and stops, so
 * `parseInt("1e9", 10)` is `1` — the string that asks for the entire table
 * would have quietly produced a one-row page instead of hitting the ceiling.
 * `Number` parses the whole string or yields NaN, which is the only reading
 * that lets the clamp actually clamp.
 */
export function parsePageSize(input: unknown): number {
  const requested = typeof input === "number" ? input : Number(String(input ?? "").trim());

  if (!Number.isFinite(requested) || requested < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.trunc(requested), MAX_PAGE_SIZE);
}

/**
 * A position in a sorted list.
 *
 * Two parts, because one is not enough. Timestamps tie — two products published
 * in the same second are ordinary — and a tie straddling a page boundary is
 * exactly where keyset pagination drops or repeats a row. The id breaks it.
 */
export type ProductCursor = {
  /** The value of whichever column the current sort orders by. */
  sortedAt: Date;
  id: string;
};

/**
 * The wire format: `<epoch-millis>.<uuid>`.
 *
 * Not base64. The parts are already URL-safe, and an unencoded cursor is
 * readable in a log and in the address bar, which makes a pagination bug
 * diagnosable instead of a guess. There is nothing secret in it — it is a
 * position in a list of public rows.
 */
const CURSOR_PATTERN =
  /^(\d{1,15})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function encodeProductCursor(cursor: ProductCursor): string {
  return `${cursor.sortedAt.getTime()}.${cursor.id}`;
}

/**
 * Parses a cursor, returning null for anything malformed.
 *
 * Null rather than a throw, and null rather than a silent default: a bad cursor
 * means "start from the beginning", which is the only safe reading of a
 * position that cannot be located. It is untrusted input like any other query
 * parameter, so the shape is checked before either half is used.
 */
export function decodeProductCursor(input: unknown): ProductCursor | null {
  if (typeof input !== "string") return null;

  const match = CURSOR_PATTERN.exec(input.trim());
  if (!match) return null;

  const sortedAt = new Date(Number(match[1]));
  if (Number.isNaN(sortedAt.getTime())) return null;

  return { sortedAt, id: match[2]! };
}
