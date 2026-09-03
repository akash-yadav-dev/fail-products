// src/app/status/[slug]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ProductList } from "@/components/products/product-list";
import { StatusBadge } from "@/components/products/status-badge";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import {
  FAILURE_STATUSES,
  findFailureStatusBySlug,
} from "@/domain/product/failure-status";
import { DEFAULT_PRODUCT_SORT } from "@/domain/product/listing";
import { listPublicDirectory } from "@/services/product/server-product";

/** The five statuses are a closed set, so every page is known at build time. */
export function generateStaticParams() {
  return FAILURE_STATUSES.map((status) => ({ slug: status.slug }));
}

/**
 * Cached like the category pages and for the same reason (ADR-027).
 *
 * `docs/DEPLOYMENT.md` §11 names `/products/[slug]` and `/categories/[slug]`
 * explicitly, but this route is the same shape — a public, crawlable list —
 * and leaving it dynamic would spend the egress the other two just saved.
 */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: PageProps<"/status/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const status = findFailureStatusBySlug(slug);

  if (!status) {
    return { title: "Status not found" };
  }

  return {
    title: status.label,
    description: `Products marked ${status.label.toLowerCase()} on FailProducts. ${status.description}`,
    alternates: { canonical: `/status/${status.slug}` },
  };
}

export default async function StatusPage({
  params,
}: PageProps<"/status/[slug]">) {
  const { slug } = await params;
  const status = findFailureStatusBySlug(slug);

  if (!status) {
    notFound();
  }

  const page = await listPublicDirectory({ failureStatus: status.value });

  return (
    <>
      <PageHeader
        title={status.label}
        description={status.description}
        eyebrow={<StatusBadge status={status.value} />}
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Status", href: "/status" },
          { label: status.label },
        ]}
      />

      <Container className="flex flex-col gap-8 py-10 sm:py-14">
        {/*
          The status is the founder's own classification of their product, not
          a verdict this site reached (docs/LEGAL.md §3). The page says so once,
          here, rather than repeating a badge on every card.
        */}
        <p className="text-sm text-muted-foreground">
          Each founder chose this status for their own product. FailProducts has
          not independently verified any of them.
        </p>

        <ProductList
          items={page.items}
          sort={DEFAULT_PRODUCT_SORT}
          nextCursor={null}
          showSort={false}
          basePath={`/status/${status.slug}`}
          emptyTitle={`Nothing is ${status.label.toLowerCase()} yet`}
          emptyDescription="No published listing carries this status right now."
        />

        {/*
          Only when the page is actually truncated. Offering to "browse every
          listing" under a status holding three of them promised a fuller list
          that does not exist, and nothing said this was a partial view.
        */}
        {page.truncated ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Showing the newest {page.items.length}.
            </p>
            <Button asChild variant="outline" className="h-11">
              <Link href={`/products?status=${status.slug}`}>
                Browse and sort every {status.label.toLowerCase()} listing
              </Link>
            </Button>
          </div>
        ) : null}
      </Container>
    </>
  );
}
