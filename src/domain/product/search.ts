// src/domain/product/search.ts
/**
 * Parsing a search box.
 *
 * The query is untrusted text from an unauthenticated public page, and it is
 * about to be handed to a Postgres text-search function. Two things have to
 * hold, and they are separate concerns that are easy to confuse:
 *
 * 1. **It must not break the query.** That is handled by `websearch_to_tsquery`
 *    at the call site, not here — it is the one Postgres text-search function
 *    designed for raw user input, and unlike `to_tsquery` it never raises a
 *    syntax error on unbalanced quotes, stray operators, or punctuation. The
 *    value is still passed as a bound parameter; sanitising a string is never
 *    what makes a query injection-safe.
 * 2. **It must not be an expensive no-op.** That is this module. An empty
 *    query, or one made entirely of punctuation, produces a tsquery that
 *    matches nothing — running it is a billed round trip that can only ever
 *    return zero rows, and rendering "no results" for a blank box is a lie
 *    about the directory.
 *
 * Domain code imports nothing from Next.js, React, Drizzle, or any provider.
 */

/**
 * The longest query worth running.
 *
 * Not a security boundary — `websearch_to_tsquery` copes with far more. It is a
 * cost boundary: a megabyte of text in a query parameter is not a search, and
 * parsing it into a tsquery is work nobody asked for.
 */
export const MAX_SEARCH_LENGTH = 128;

/**
 * Whether a string contains anything Postgres could turn into a lexeme.
 *
 * `websearch_to_tsquery('english', '---')` yields an empty tsquery, which
 * matches nothing. Detecting that here means the difference between "you
 * searched for punctuation" and "the directory is empty" is decided before a
 * query is sent, not after one comes back empty.
 */
function hasSearchableContent(input: string): boolean {
  // Letters or digits in any script — the site lists products with names in
  // more alphabets than Latin, and an /[a-z0-9]/ test would reject them.
  return /[\p{L}\p{N}]/u.test(input);
}

/**
 * The query to run, or null when there is nothing worth running.
 *
 * Null is the "show the whole directory" signal, and it is deliberately the
 * same answer for a blank box and for a box holding only punctuation. Both mean
 * the visitor has not actually asked for anything yet.
 */
export function parseSearchQuery(input: unknown): string | null {
  if (typeof input !== "string") return null;

  // Collapse whitespace before measuring, so a long run of spaces is not
  // mistaken for a long query.
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return null;
  if (!hasSearchableContent(trimmed)) return null;

  return trimmed.slice(0, MAX_SEARCH_LENGTH);
}
