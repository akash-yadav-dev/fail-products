// src/app/products/[slug]/opengraph-image.tsx
import { ImageResponse } from "next/og";

import { findFailureStatus, type FailureStatus } from "@/domain/product/failure-status";
import { canSkipDatabaseAtBuild } from "@/lib/config/database";
import { siteConfig } from "@/lib/config/site";
import {
  listProductsForSitemap,
  resolvePublicProduct,
} from "@/services/product/server-product";

/**
 * The share card for one product.
 *
 * `docs/PRODUCT.md` §9 requires an Open Graph image per public product page.
 * This renders one from the listing's own data rather than shipping a single
 * static image, because a directory whose every link previews identically gives
 * a reader no reason to click any particular one.
 *
 * `next/og` is part of Next, so this adds no dependency and needs no dependency
 * gate. **UNVERIFIED: it has never run on Workers.** Nothing in this project
 * has — deployment is deferred until a hosting target is decided, and the
 * existing "Workers compatibility unverified" warning covers the whole
 * application. If it turns out `ImageResponse` cannot run there, the fallback
 * is a static image referenced from `generateMetadata`, which is a small
 * change confined to this file.
 *
 * The card states what the founder said, attributed. `docs/LEGAL.md` §3 applies
 * to a share image exactly as it applies to the page — arguably more, since the
 * image is what gets seen when the link is pasted somewhere the page is not.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A product listing on FailProducts";

/**
 * Cached for an hour.
 *
 * A share card is fetched by every unfurler that sees the link — a paste into
 * one busy chat is a burst of requests for an image that has not changed. An
 * hour is far longer than the page's own five minutes because the card carries
 * only the name, tagline, and status, which is the part of a listing that
 * changes least.
 */
export const revalidate = 3600;

/**
 * Prerender the same listings the page itself prerenders.
 *
 * `revalidate` above does nothing without this. Measured before it existed:
 * `cache-control: public, max-age=0, must-revalidate`, no `x-nextjs-cache`
 * header at all, and a flat ~300 ms over five consecutive requests — every one
 * of them a Neon query plus a full 1200x630 satori render. That is precisely
 * the burst the comment above claims to defend against, and it was arriving
 * uncached.
 *
 * The sibling page documents the same trap for the same reason. A route with
 * dynamic params is rendered on demand unless its params are known at build
 * time, and `revalidate` describes how long a cached render lives — so with
 * nothing cached, it describes nothing.
 *
 * `dynamicParams` defaults to true, so a listing published after the build
 * still gets a card; it is rendered once on demand and then cached like the
 * rest.
 */
export async function generateStaticParams() {
  // CI builds without a database on purpose. An empty list is correct there:
  // every card is then served on demand, which is what happens today anyway.
  if (canSkipDatabaseAtBuild()) return [];

  const products = await listProductsForSitemap(1_000);
  return products.map((product) => ({ slug: product.slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await resolvePublicProduct(slug);

  // A missing or moved product still has to return an image: this route is
  // fetched by link unfurlers, not by people, and throwing produces a broken
  // preview rather than a 404 anyone sees.
  const product = resolved.kind === "found" ? resolved.product : null;
  const status = product
    ? findFailureStatus(product.failureStatus as FailureStatus)
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0a",
          color: "#fafafa",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {status ? (
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                border: "1px solid #3f3f46",
                borderRadius: 999,
                padding: "8px 20px",
                fontSize: 26,
                color: "#a1a1aa",
              }}
            >
              {status.label}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              fontSize: product && product.name.length > 32 ? 68 : 88,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            {product ? product.name : siteConfig.name}
          </div>

          {product?.tagline ? (
            <div
              style={{
                display: "flex",
                fontSize: 32,
                color: "#a1a1aa",
                lineHeight: 1.4,
              }}
            >
              {product.tagline.slice(0, 120)}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 26,
            color: "#71717a",
          }}
        >
          <div style={{ display: "flex" }}>{siteConfig.name}</div>
          {/*
            The attribution, on the image itself. A share card that says
            "Abandoned" with no source reads as this site's verdict on someone
            else's company — the exact framing docs/LEGAL.md §3 forbids.
          */}
          <div style={{ display: "flex" }}>
            {product ? "Listed by its founder" : siteConfig.tagline}
          </div>
        </div>
      </div>
    ),
    size
  );
}
