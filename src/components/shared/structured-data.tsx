// src/components/shared/structured-data.tsx
import { siteConfig } from "@/lib/config/site";

/**
 * JSON-LD, kept to what is honestly true.
 *
 * The Phase 2 plan is explicit: structured data only "where it is honest.
 * Never mark up a community opinion as a review." That rules out more than it
 * allows here, and the omissions are the point:
 *
 * - **No `Review` or `AggregateRating`.** Comments do not exist yet (Phase 3),
 *   and when they do they are community opinion — `docs/LEGAL.md` §3 forbids
 *   rendering that in the position of a verified fact, and a `Review` in
 *   structured data is exactly that, published to search engines as a rating of
 *   a named real business.
 * - **No `Product` with `offers`.** These are listings *about* products, not
 *   products for sale. `offers` on a shut-down product would be a fabrication.
 * - **No `Organization` for the listed product.** The project has verified
 *   nothing about the companies it lists, and asserting their identity in
 *   machine-readable form is a claim it cannot support.
 *
 * What is left — a breadcrumb trail and the site's own identity — is
 * structure this application actually knows to be true.
 */

/**
 * Serialises JSON-LD for a `<script>` body.
 *
 * `<` is escaped so a product name containing `</script>` cannot close the tag
 * and start an element. This is user-controlled text going into a raw script
 * body: `JSON.stringify` escapes quotes and backslashes, and does not escape
 * that. It is the one place on a public page where
 * `dangerouslySetInnerHTML` is unavoidable, so the escape is not optional.
 */
function serialise(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialise(data) }}
    />
  );
}

export type BreadcrumbEntry = {
  name: string;
  /** Site-relative, e.g. `/products`. Omitted on the final crumb. */
  path?: string;
};

/**
 * The trail already rendered in the page header, in machine-readable form.
 *
 * Safe because it asserts only where a page sits in this site's own hierarchy,
 * which is a fact about this site and nobody else.
 */
export function BreadcrumbJsonLd({ items }: { items: readonly BreadcrumbEntry[] }) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.name,
          ...(item.path ? { item: `${siteConfig.url}${item.path}` } : {}),
        })),
      }}
    />
  );
}

/**
 * The site's own identity. Rendered once, on the home page.
 *
 * `sameAs` carries the project's own social profile, not a listed product's.
 */
export function SiteJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            "@id": `${siteConfig.url}/#website`,
            url: siteConfig.url,
            name: siteConfig.name,
            description: siteConfig.description,
            publisher: { "@id": `${siteConfig.url}/#organization` },
          },
          {
            "@type": "Organization",
            "@id": `${siteConfig.url}/#organization`,
            name: siteConfig.name,
            url: siteConfig.url,
            sameAs: [siteConfig.social.x.url, siteConfig.repository],
          },
        ],
      }}
    />
  );
}
