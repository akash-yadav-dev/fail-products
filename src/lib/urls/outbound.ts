// src/lib/urls/outbound.ts
/**
 * Outbound links to the products this site lists.
 *
 * Two rules meet here, and both have to hold on the same line of output:
 *
 * 1. `AGENTS.md` §7 and `SECURITY.md` require an external URL to be validated
 *    **at render**, not only at write. This builds on `parseExternalUrl`, which
 *    is the single allowlist of safe schemes, rather than re-deciding what is
 *    safe.
 * 2. `docs/PRODUCT.md` §5.1 requires every product website link from
 *    FailProducts to carry a platform-owned attribution parameter, so the one
 *    number this project may honestly quote — outbound clicks it sent itself —
 *    is attributable at the destination.
 *
 * Doing both in one function is what stops a page from shipping a link that
 * satisfies one rule and quietly drops the other.
 */

import { parseExternalUrl } from "@/lib/validation/url";

/**
 * The attribution parameters, exactly as `docs/PRODUCT.md` §5.1 specifies them.
 *
 * `utm_campaign` varies by where the link was clicked; the other two never do.
 */
const UTM_SOURCE = "failproducts";
const UTM_MEDIUM = "referral";

/**
 * Which surface the visitor left from.
 *
 * A closed set rather than a free string: the campaign value ends up in someone
 * else's analytics, and an unbounded one would let a product name or a slug
 * leak into a parameter that is supposed to describe our page, not their data.
 */
export const OUTBOUND_CAMPAIGNS = {
  productPage: "product-page",
  productList: "product-list",
} as const;

export type OutboundCampaign =
  (typeof OUTBOUND_CAMPAIGNS)[keyof typeof OUTBOUND_CAMPAIGNS];

/**
 * A safe, attributed link to a product's own website — or null.
 *
 * Null means "render no link at all". That is the only correct failure mode: a
 * `javascript:` URL that reached the column through an import, a fixture, or a
 * rule that did not exist when the row was written must not become an `href`,
 * and there is nothing useful to fall back to.
 *
 * Existing UTM parameters on the stored URL are overwritten rather than
 * appended to. Two `utm_source` values in one query string is not a link with
 * two sources; it is a link whose attribution depends on which one the
 * destination happens to read first.
 */
export function buildOutboundProductUrl(
  websiteUrl: string | null | undefined,
  campaign: OutboundCampaign
): string | null {
  const url = parseExternalUrl(websiteUrl);
  if (!url) return null;

  url.searchParams.set("utm_source", UTM_SOURCE);
  url.searchParams.set("utm_medium", UTM_MEDIUM);
  url.searchParams.set("utm_campaign", campaign);

  return url.toString();
}
