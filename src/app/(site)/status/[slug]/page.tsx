// src/app/status/[slug]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductList } from "@/components/products/product-list";
import { StatusBadge } from "@/components/products/status-badge";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import {
  FAILURE_STATUSES,
  findFailureStatusBySlug,
} from "@/domain/product/failure-status";
import { listPublicDirectory } from "@/services/product/server-product";

/** The five statuses are a closed set, so every page is known at build time. */
export function generateStaticParams() {
  return FAILURE_STATUSES.map((status) => ({ slug: status.slug }));
}

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
  searchParams,
}: PageProps<"/status/[slug]">) {
  const { slug } = await params;
  const status = findFailureStatusBySlug(slug);

  if (!status) {
    notFound();
  }

  const query = await searchParams;
  const page = await listPublicDirectory({
    failureStatus: status.value,
    sort: query.sort,
    cursor: query.cursor,
  });

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

      <Container className="py-10 sm:py-14">
        {/*
          The status is the founder's own classification of their product, not
          a verdict this site reached (docs/LEGAL.md §3). The page says so once,
          here, rather than repeating a badge on every card.
        */}
        <p className="mb-6 text-sm text-muted-foreground">
          Each founder chose this status for their own product. FailProducts has
          not independently verified any of them.
        </p>

        <ProductList
          items={page.items}
          sort={page.sort}
          nextCursor={page.nextCursor}
          basePath={`/status/${status.slug}`}
          emptyTitle={`Nothing is ${status.label.toLowerCase()} yet`}
          emptyDescription="No published listing carries this status right now."
        />
      </Container>
    </>
  );
}
