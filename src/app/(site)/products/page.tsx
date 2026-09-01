// src/app/products/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ProductList } from "@/components/products/product-list";
import { ProductSearch } from "@/components/products/product-search";
import { StatusBadge } from "@/components/products/status-badge";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import { FAILURE_STATUSES } from "@/domain/product/failure-status";
import { listPublicDirectory } from "@/services/product/server-product";

export const metadata: Metadata = {
  title: "Products",
  description:
    "Browse products that failed, stalled, or never found traction, and read what their founders learned.",
  // Always the bare path. ?sort=, ?cursor=, and ?q= render the same listings in
  // a different order, and each is a duplicate of this page rather than a page
  // of its own (docs/PRODUCT.md §9).
  alternates: { canonical: "/products" },
};

export default async function ProductsPage({
  searchParams,
}: PageProps<"/products">) {
  const params = await searchParams;

  // Every parameter is untrusted: this page is public and unauthenticated. The
  // service parses each one against the domain allowlists rather than passing
  // a query string through to a query.
  const page = await listPublicDirectory({
    sort: params.sort,
    cursor: params.cursor,
    search: params.q,
  });

  const query = typeof params.q === "string" ? params.q : "";

  return (
    <>
      <PageHeader
        title="Products"
        description="Every listed product. Each one is published by the person who built it."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Products" }]}
        actions={
          <Button asChild size="lg" className="h-11">
            <Link href="/submit">Submit a product</Link>
          </Button>
        }
      />

      <Container className="flex flex-col gap-8 py-10 sm:py-14">
        <div className="flex flex-col gap-4">
          <ProductSearch initialQuery={query} />

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

        <ProductList
          items={page.items}
          sort={page.sort}
          nextCursor={page.nextCursor}
          search={page.search}
          truncated={page.truncated}
          basePath="/products"
          emptyTitle="No products listed yet"
          emptyDescription="The directory is empty because nobody has published a listing. Someone has to fail first, and it may as well be on purpose."
        />
      </Container>
    </>
  );
}
