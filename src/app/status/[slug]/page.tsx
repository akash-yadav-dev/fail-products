// src/app/status/[slug]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackageOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { StatusBadge } from "@/components/products/status-badge";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import {
  FAILURE_STATUSES,
  findFailureStatusBySlug,
} from "@/domain/product/failure-status";

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
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpen />
            </EmptyMedia>
            <EmptyTitle>
              Nothing is {status.label.toLowerCase()} yet
            </EmptyTitle>
            <EmptyDescription>
              No products carry this status, because no products are listed
              yet.
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild variant="outline" className="h-10">
            <Link href="/status">Back to all statuses</Link>
          </Button>
        </Empty>
      </Container>
    </>
  );
}
