// src/domain/shared/reserved-names.ts
/**
 * Names no user may claim, in any slug-shaped namespace.
 *
 * ADR-019 requires this list to be enforced at creation "across all four
 * slug-shaped namespaces" — usernames, product slugs, category slugs, and tag
 * slugs. One list, checked in one place, because a word reserved for a product
 * but claimable as a username still produces the collision it was meant to stop.
 *
 * Domain code imports nothing from Next.js, React, or any provider.
 */

/**
 * Every path segment the application itself serves.
 *
 * A username renders at `/u/[username]` and a product at `/products/[slug]`, so
 * neither can literally shadow a top-level route today. They are reserved
 * anyway: the namespaces are one routing change away from being flat, and a
 * name that has already been handed out cannot be reclaimed without breaking
 * the URL that was given to whoever holds it.
 */
const ROUTE_NAMES = [
  "about",
  "api",
  "auth",
  "categories",
  "category",
  "dashboard",
  "guidelines",
  "privacy",
  "products",
  "status",
  "submit",
  "takedown",
  "terms",
  "u",
] as const;

/**
 * Names that would let an account or listing pass itself off as the site.
 *
 * This is the half of the list that matters most. `@admin` and `@support` are
 * the handles a phishing attempt wants, and there is no moderation queue that
 * catches impersonation as reliably as never issuing the name.
 */
const IMPERSONATION_NAMES = [
  "abuse",
  "admin",
  "administrator",
  "billing",
  "contact",
  "failproducts",
  "help",
  "info",
  "legal",
  "mod",
  "moderator",
  "official",
  "owner",
  "root",
  "security",
  "staff",
  "support",
  "system",
  "team",
  "trust",
] as const;

/** Verbs and words a future route is likely to want. Cheap now, impossible later. */
const RESERVED_FOR_LATER = [
  "account",
  "delete",
  "edit",
  "explore",
  "feed",
  "login",
  "logout",
  "me",
  "my",
  "new",
  "profile",
  "register",
  "search",
  "settings",
  "signin",
  "signout",
  "signup",
  "tags",
] as const;

/** Hostnames and well-known files that appear at a domain root. */
const INFRASTRUCTURE_NAMES = [
  "assets",
  "cdn",
  "favicon",
  "ftp",
  "images",
  "img",
  "mail",
  "media",
  "public",
  "robots",
  "sitemap",
  "smtp",
  "ssl",
  "static",
  "webmail",
  "well-known",
  "www",
] as const;

export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  ...ROUTE_NAMES,
  ...IMPERSONATION_NAMES,
  ...RESERVED_FOR_LATER,
  ...INFRASTRUCTURE_NAMES,
]);

/**
 * Whether a name is reserved.
 *
 * Compares lowercased, because the namespaces this guards are all
 * case-insensitive — reserving "admin" while allowing "Admin" reserves nothing.
 */
export function isReservedName(name: string): boolean {
  return RESERVED_NAMES.has(name.trim().toLowerCase());
}
