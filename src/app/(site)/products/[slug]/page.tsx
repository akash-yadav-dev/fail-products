// src/app/products/[slug]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CommentComposer } from "@/components/comments/comment-composer";
import { CommentList } from "@/components/comments/comment-list";
import { ReportDialog } from "@/components/comments/report-dialog";
import { ProductCard } from "@/components/products/product-card";
import { StatusBadge } from "@/components/products/status-badge";
import {
  SourceTierBadge,
  SourcedSection,
} from "@/components/products/source-tier";
import { WaitlistForm } from "@/components/waitlist/waitlist-form";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import { BreadcrumbJsonLd } from "@/components/shared/structured-data";
import { findFailureStatus, type FailureStatus } from "@/domain/product/failure-status";
import {
  COMMUNITY_OPINION_TIER,
  OWNER_SUPPLIED_TIER,
} from "@/domain/product/source-tier";
import { OUTBOUND_CAMPAIGNS, buildOutboundProductUrl } from "@/lib/urls/outbound";
import { canSkipDatabaseAtBuild } from "@/lib/config/database";
import { turnstileSiteKey } from "@/lib/config/turnstile";
import { externalUrlHost } from "@/lib/validation/url";
import { listComments } from "@/services/comment/server-comment";
import {
  listProductsForSitemap,
  listPublicDirectory,
  resolvePublicProduct,
} from "@/services/product/server-product";
import { joinWaitlistAction, postCommentAction, reportAction } from "./actions";

/**
 * A product listing.
 *
 * Three outcomes, and the page has to tell them apart (ADR-019). An unknown
 * slug is a 404. A *retired* slug is a 301 to the current one, because search
 * engines and other people's links already point at it and returning 404 would
 * discard every one of them. Only a live slug renders.
 *
 * Every assertion on this page is a **creator claim** unless it is something
 * this system observed directly. `docs/LEGAL.md` §3 makes that labelling
 * mandatory: the site publishes adversarial content about named real
 * businesses, and an unattributed sentence here reads as FailProducts asserting
 * a fact about someone else's company.
 */

/**
 * Cached for five minutes, then revalidated.
 *
 * `docs/DEPLOYMENT.md` §11 makes the cache hit ratio on this route a
 * launch-blocking metric: Neon's free plan allows 5 GB of egress a month, and
 * an uncached product page queries the database on every crawler and every
 * visitor. This page takes no query parameters, so it is the one public route
 * that can be cached wholesale — and it is also the highest-volume one.
 *
 * Five minutes rather than an hour because an owner who fixes a typo should see
 * it, and because the window is short enough that it needs no explicit
 * invalidation on publish — which `docs/ARCHITECTURE.md` §5 would otherwise
 * require, and which is a Phase 3 concern once comment counts appear.
 */
export const revalidate = 300;

/**
 * Prerender the listings that exist at build time.
 *
 * Without this the route is rendered on demand and `revalidate` above does
 * nothing — verified by inspecting `Cache-Control` on three consecutive
 * requests to a built server, which returned `private, no-cache, no-store`
 * until these params existed. That is the difference between a product page
 * that queries Neon on every crawler hit and one that does not, which
 * `docs/DEPLOYMENT.md` §11 calls a launch-blocking metric.
 *
 * A slug published after the build is still served: `dynamicParams` defaults to
 * true, so an unlisted slug renders on demand and is then cached like the rest.
 */
export async function generateStaticParams() {
  // CI builds without a database on purpose. An empty list is correct there:
  // every page is then served on demand, which is what happens today anyway.
  if (canSkipDatabaseAtBuild()) return [];

  const products = await listProductsForSitemap(1_000);
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolvePublicProduct(slug);

  if (resolved.kind !== "found") {
    // Neither a missing product nor a redirect is a page worth indexing. The
    // redirect itself is what search engines should follow.
    return {
      title: "Product not found",
      robots: { index: false, follow: false },
    };
  }

  const { product } = resolved;
  const status = findFailureStatus(product.failureStatus as FailureStatus);
  const description =
    product.tagline ??
    `${product.name} is listed on FailProducts as ${status.label.toLowerCase()}.`;

  return {
    title: product.name,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: "article",
      title: product.name,
      description,
      url: `/products/${product.slug}`,
    },
  };
}

export default async function ProductPage({
  params,
}: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const resolved = await resolvePublicProduct(slug);

  // ADR-019: a rename must not break the URL that was already handed out.
  if (resolved.kind === "moved") {
    permanentRedirect(`/products/${resolved.slug}`);
  }
  if (resolved.kind === "missing") {
    notFound();
  }

  const { product } = resolved;
  const status = findFailureStatus(product.failureStatus as FailureStatus);

  // Validated again here, not only at write (AGENTS.md §7), and the same call
  // attaches the attribution parameters docs/PRODUCT.md §5.1 requires. A URL
  // that fails validation renders no link at all rather than an unsafe one.
  const outboundHref = buildOutboundProductUrl(
    product.websiteUrl,
    OUTBOUND_CAMPAIGNS.productPage
  );
  const outboundHost = externalUrlHost(product.websiteUrl);

  // "Related" is deliberately just the rest of the directory for now. A real
  // relatedness signal needs categories on more than a handful of rows, and a
  // fabricated one would put this product's name beside another founder's
  // product on the strength of nothing.
  // Two reads, issued together: neither needs the other's answer, and this
  // page is prerendered, so the pair happens once per revalidation rather than
  // once per visitor.
  const [related, discussion] = await Promise.all([
    listPublicDirectory({ pageSize: 3 }),
    listComments({ productId: product.id }),
  ]);
  const others = related.items.filter((item) => item.id !== product.id).slice(0, 3);

  // Read once, server-side, and passed down. It is public by design but is not
  // a NEXT_PUBLIC_ variable, so the bundle never embeds it and there is one
  // place that decides whether the control is on.
  const siteKey = turnstileSiteKey();

  return (
    <>
      {/*
        The trail already in the header, machine-readable. Nothing else about
        this product is marked up: see src/components/shared/structured-data.tsx
        for why a Review or a Product with offers would be a fabrication.
      */}
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "Products", path: "/products" },
          { name: product.name },
        ]}
      />

      <PageHeader
        title={product.name}
        description={product.tagline ?? undefined}
        eyebrow={
          <>
            <StatusBadge status={product.failureStatus as FailureStatus} />
            {/*
              The status is the founder's own classification of their product,
              so it is labelled as one. Rendering it bare would make it read as
              a verdict this site had reached.
            */}
            <SourceTierBadge tier={OWNER_SUPPLIED_TIER} />
          </>
        }
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Products", href: "/products" },
          { label: product.name },
        ]}
        actions={
          outboundHref ? (
            <Button asChild size="lg" className="h-11">
              <a
                href={outboundHref}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                Visit {outboundHost ?? "website"}
                <ExternalLink aria-hidden="true" />
              </a>
            </Button>
          ) : null
        }
      />

      <Container className="py-10 sm:py-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
          {/*
            Section order follows docs/DESIGN.md §6: identity and status are in
            the header above, then the explanation, then the facts, then the
            failure story, then discussion, then related products.
          */}
          <div className="flex flex-col gap-10">
            <SourcedSection title="Why it is listed" tier={OWNER_SUPPLIED_TIER}>
              {/*
                The wording is the one docs/LEGAL.md §3 marks acceptable — "the
                founder listed this product as abandoned", never "this product
                failed". The subject of the sentence is the founder's act of
                listing it, not a verdict this site reached.
              */}
              <p className="text-base text-muted-foreground text-pretty">
                {product.ownerUsername ? (
                  <>
                    <Link
                      href={`/u/${product.ownerUsername}`}
                      className="rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      @{product.ownerUsername}
                    </Link>{" "}
                    listed
                  </>
                ) : (
                  "The founder listed"
                )}{" "}
                {product.name} as{" "}
                <strong className="font-medium text-foreground">
                  {status.label.toLowerCase()}
                </strong>
                . {status.description}
              </p>
            </SourcedSection>

            {product.description ? (
              <SourcedSection
                title="What went wrong"
                tier={OWNER_SUPPLIED_TIER}
              >
                {/*
                  Plain text, rendered as text. docs/ENGINEERING.md §8 prefers
                  Markdown or plain text over arbitrary HTML, and nothing here
                  goes near dangerouslySetInnerHTML — this is user-supplied
                  content about a named third party.
                */}
                <div className="flex flex-col gap-4 text-base text-muted-foreground text-pretty">
                  {product.description
                    .split(/\n{2,}/)
                    .map((paragraph, index) => (
                      <p key={index} className="whitespace-pre-line">
                        {paragraph}
                      </p>
                    ))}
                </div>
              </SourcedSection>
            ) : null}

            <section id="discussion" className="flex flex-col gap-5">
              <h2 className="text-xl font-semibold tracking-tight">
                Community discussion
                {discussion.items.length > 0 ? (
                  <span className="ml-2 text-base font-normal text-muted-foreground">
                    {discussion.items.length}
                    {discussion.hasMore ? "+" : ""}
                  </span>
                ) : null}
              </h2>

              {/*
                Every comment here is a community opinion and is labelled as
                one. docs/LEGAL.md §3 and docs/MODERATION.md §8 both require
                the distinction: an unattributed sentence on this page reads as
                FailProducts asserting a fact about a named real business.
              */}
              <SourceTierBadge tier={COMMUNITY_OPINION_TIER} />

              <CommentList
                comments={discussion.items}
                productOwnerId={product.ownerId}
                reportAction={reportAction}
                turnstileSiteKey={siteKey}
              />

              {discussion.hasMore ? (
                // Said plainly rather than hidden. The page is prerendered and
                // takes no query parameters (ADR-027), so page two would cost
                // the cache; a listing that overflows this is the measurement
                // that justifies paying for it (CLAUDE.md §7).
                //
                // The threshold, named so it is a decision rather than a
                // surprise: **the first listing to render this sentence** is
                // what forces comment pagination. The keyset already exists in
                // CommentRepository; what it needs is a route that can carry a
                // cursor without making this page dynamic — a `/products/
                // [slug]/comments` sub-route, not a `?cursor=` here. Until
                // then the thread genuinely dead-ends at this number,
                // including for the founder it is about.
                <p className="text-sm text-muted-foreground">
                  Showing the first {discussion.items.length} comments.
                </p>
              ) : null}

              <CommentComposer
                productId={product.id}
                action={postCommentAction}
                turnstileSiteKey={siteKey}
              />
            </section>

            {/*
              docs/DESIGN.md §6 puts "waitlist / action" between the discussion
              and the related products, and that is where it earns its place:
              somebody who has just read why a product failed and what other
              people made of it is the person best placed to decide whether they
              want to hear if it comes back.

              Rendered only when the owner has switched it on. The flag comes
              from the same row the page already loaded, so this costs no query
              — and the whole section is absent from the prerendered HTML for
              every listing that has not opted in.
            */}
            {product.waitlistEnabled ? (
              <section id="waitlist" className="flex flex-col gap-4">
                <h2 className="text-xl font-semibold tracking-tight">
                  Hear if it comes back
                </h2>
                <p className="text-sm text-muted-foreground text-pretty">
                  {product.ownerUsername ? `@${product.ownerUsername}` : "The founder"}{" "}
                  is collecting addresses for {product.name}. FailProducts
                  confirms yours by email first, and never writes to an address
                  that has not been confirmed.
                </p>

                <div className="rounded-lg border bg-muted/30 p-4 sm:p-5">
                  <WaitlistForm
                    productId={product.id}
                    productName={product.name}
                    action={joinWaitlistAction}
                    turnstileSiteKey={siteKey}
                  />
                </div>
              </section>
            ) : null}

            {others.length > 0 ? (
              <section className="flex flex-col gap-4">
                <h2 className="text-xl font-semibold tracking-tight">
                  Other listings
                </h2>
                <ul className="grid gap-4 sm:grid-cols-2">
                  {others.map((item) => (
                    <li key={item.id} className="flex">
                      <ProductCard product={item} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Core facts</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">Status</span>
                  <StatusBadge status={product.failureStatus as FailureStatus} />
                </div>

                {/*
                  Linked, not just stated. This page invested in getting the
                  category right at submission and then showed the answer
                  nowhere — and a category landing page with no inbound links
                  from its own listings is a page search engines have little
                  reason to rank.
                */}
                {product.categorySlug && product.categoryName ? (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">Category</span>
                    <Link
                      href={`/categories/${product.categorySlug}`}
                      className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {product.categoryName}
                    </Link>
                  </div>
                ) : null}

                {outboundHost ? (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">Website</span>
                    {outboundHref ? (
                      <a
                        href={outboundHref}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="min-w-0 truncate rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {outboundHost}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Not available</span>
                    )}
                  </div>
                ) : null}

                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">Listed</span>
                  {product.publishedAt ? (
                    <time
                      dateTime={product.publishedAt.toISOString()}
                      className="font-medium"
                    >
                      {product.publishedAt.toISOString().slice(0, 10)}
                    </time>
                  ) : (
                    <span className="text-muted-foreground">Unknown</span>
                  )}
                </div>

                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">Last updated</span>
                  <time
                    dateTime={product.updatedAt.toISOString()}
                    className="font-medium"
                  >
                    {product.updatedAt.toISOString().slice(0, 10)}
                  </time>
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-3">
                  <span className="text-xs text-muted-foreground">
                    Something wrong here?
                  </span>
                  {/*
                    docs/MODERATION.md §5 puts a report action on every public
                    product as well as every comment. It is the founder's route
                    too: §7 gives creators a way to report abusive content
                    about their own listing.
                  */}
                  <ReportDialog
                    targetType="PRODUCT"
                    targetId={product.id}
                    label={product.name}
                    action={reportAction}
                    turnstileSiteKey={siteKey}
                  />
                </div>

                <p className="text-xs text-muted-foreground text-pretty">
                  {/*
                    docs/LEGAL.md §3: the acceptable phrasing is "the founder
                    listed this product as abandoned", never "this product
                    failed". The distinction is the whole legal position.
                  */}
                  Status and description are stated by the product&rsquo;s
                  founder. FailProducts has not independently verified them.
                </p>
              </CardContent>
            </Card>

            {product.ownerUsername ? (
              <Card>
                <CardHeader>
                  <CardTitle>Founder</CardTitle>
                </CardHeader>
                <CardContent>
                  <Link
                    href={`/u/${product.ownerUsername}`}
                    className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    @{product.ownerUsername}
                  </Link>
                </CardContent>
              </Card>
            ) : null}
          </aside>
        </div>
      </Container>
    </>
  );
}
