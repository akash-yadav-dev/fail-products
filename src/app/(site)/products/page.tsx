// src/app/products/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PackageOpen, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/products/status-badge";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import { FAILURE_STATUSES } from "@/domain/product/failure-status";

export const metadata: Metadata = {
  title: "Products",
  description:
    "Browse products that failed, stalled, or never found traction, and read what their founders learned.",
};

export default function ProductsPage() {
  return (
    <>
      <PageHeader
        title="Products"
        description="Every listed product, newest first. Each one is published by the person who built it."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Products" }]}
        actions={
          <Button asChild size="lg" className="h-11">
            <Link href="/submit">Submit a product</Link>
          </Button>
        }
      />

      <Container className="flex flex-col gap-8 py-10 sm:py-14">
        <div className="flex flex-col gap-4">
          <div className="relative max-w-md">
            <label htmlFor="product-search" className="sr-only">
              Search products
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="product-search"
              type="search"
              placeholder="Search is not wired up yet"
              className="h-11 pl-9"
              disabled
            />
          </div>

          <ul className="flex flex-wrap items-center gap-2">
            {FAILURE_STATUSES.map((status) => (
              <li key={status.value}>
                <Link
                  href={`/status/${status.slug}`}
                  className="inline-flex rounded-4xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <StatusBadge status={status.value} />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpen />
            </EmptyMedia>
            <EmptyTitle>No products listed yet</EmptyTitle>
            <EmptyDescription>
              The directory is empty because submissions are not open. Someone
              has to fail first, and it may as well be on purpose.
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild variant="outline" className="h-10">
            <Link href="/submit">Be the first listing</Link>
          </Button>
        </Empty>
      </Container>
    </>
  );
}
