// src/app/robots.ts
import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/config/site";

/**
 * What crawlers may read.
 *
 * `robots.txt` is a request, not an access control. Nothing listed under
 * `disallow` is protected by being listed — `/dashboard` is protected by the
 * session check in its layout, and the pages that must not be indexed also
 * carry their own `noindex`. This file only keeps crawl budget off routes that
 * can never produce a useful public result.
 *
 * `/api/` is disallowed because a crawler following an auth callback URL is
 * pure waste on both sides. `/dashboard/` is private. Query strings are not
 * disallowed: `?sort=` and `?q=` produce no links a crawler can discover from
 * the sitemap, and blanket-blocking parameters would also block the pagination
 * a crawler needs to reach every listing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/auth/"],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
