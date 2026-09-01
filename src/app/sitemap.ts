// src/app/sitemap.ts
import type { MetadataRoute } from "next";

import { PRODUCT_CATEGORIES } from "@/domain/product/category";
import { FAILURE_STATUSES } from "@/domain/product/failure-status";
import { canSkipDatabaseAtBuild } from "@/lib/config/database";
import { siteConfig } from "@/lib/config/site";
import { listProductsForSitemap } from "@/services/product/server-product";

/**
 * The sitemap.
 *
 * `docs/PRODUCT.md` §9: "Only index useful, unique pages. Do not generate
 * thousands of thin parameterized pages." Everything here is a page with its
 * own content and its own canonical URL, and nothing here is parameterized:
 * no `?sort=`, no `?cursor=`, no `?q=`. Those render the same listings in a
 * different order, which is the definition of a duplicate.
 *
 * Products come from the same visibility predicate as every public list. A
 * sitemap that names a hidden product hands a crawler the URL of something a
 * moderator took down — worse than an ordinary leak, because it is an
 * invitation.
 *
 * Legal pages are absent on purpose. They are placeholders carrying no policy
 * text and are `noindex` until `docs/LEGAL.md` §4 is satisfied; listing them
 * would ask for exactly the indexing their own metadata refuses.
 */

/**
 * Regenerated hourly, not baked at build time.
 *
 * Without this the sitemap is prerendered once and every product published
 * afterwards is invisible to crawlers until the next deploy — which, for a
 * directory whose whole purpose is search traffic, is the sitemap failing at
 * the one job it has. An hour is well inside how fast a crawler acts on it, and
 * it keeps the unpaginated product query to 24 executions a day rather than one
 * per crawler request (`docs/DEPLOYMENT.md` §11: caching is a budget).
 */
export const revalidate = 3600;

/** Pages that exist regardless of what is in the database. */
const STATIC_PATHS = [
  { path: "", priority: 1, changeFrequency: "daily" as const },
  { path: "/products", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/categories", priority: 0.7, changeFrequency: "weekly" as const },
  { path: "/status", priority: 0.7, changeFrequency: "weekly" as const },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/submit", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/guidelines", priority: 0.4, changeFrequency: "monthly" as const },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((entry) => ({
    url: `${siteConfig.url}${entry.path}`,
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));

  // Both taxonomies are closed sets known without a query, so they never
  // depend on the database being reachable at build time.
  const statusEntries: MetadataRoute.Sitemap = FAILURE_STATUSES.map((status) => ({
    url: `${siteConfig.url}/status/${status.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const categoryEntries: MetadataRoute.Sitemap = PRODUCT_CATEGORIES.map(
    (category) => ({
      url: `${siteConfig.url}/categories/${category.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    })
  );

  // Same build-without-a-database concession as /categories. The static,
  // status, and category entries below need no database at all, so a CI build
  // still produces a valid sitemap — just one without listings in it.
  const products = canSkipDatabaseAtBuild() ? [] : await listProductsForSitemap();
  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${siteConfig.url}/products/${product.slug}`,
    // The row's own timestamp, not `now`. A lastmod that changes on every
    // build tells a crawler every page changed, which teaches it to stop
    // believing the field.
    lastModified: product.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [
    ...staticEntries,
    ...productEntries,
    ...categoryEntries,
    ...statusEntries,
  ];
}
