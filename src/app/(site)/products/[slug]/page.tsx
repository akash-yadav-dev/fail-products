// src/app/products/[slug]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductCard } from "@/components/products/product-card";
import { StatusBadge } from "@/components/products/status-badge";
import {
  SourceTierBadge,
  SourcedSection,
} from "@/components/products/source-tier";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import { findFailureStatus, type FailureStatus } from "@/domain/product/failure-status";
import { OWNER_SUPPLIED_TIER } from "@/domain/product/source-tier";
import { OUTBOUND_CAMPAIGNS, buildOutboundProductUrl } from "@/lib/urls/outbound";
import { externalUrlHost } from "@/lib/validation/url";
import {
  listPublicDirectory,
  resolvePublicProduct,
} from "@/services/product/server-product";

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
  const related = await listPublicDirectory({ pageSize: 3 });
  const others = related.items.filter((item) => item.id !== product.id).slice(0, 3);

  return (
    <>
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

            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold tracking-tight">
                Community discussion
              </h2>
              <Alert>
                <AlertTitle>Comments are not open yet</AlertTitle>
                <AlertDescription>
                  Discussion arrives with the community phase. Until it does,
                  this page carries only what the founder said about their own
                  product.
                </AlertDescription>
              </Alert>
            </section>

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

                <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground text-pretty">
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
