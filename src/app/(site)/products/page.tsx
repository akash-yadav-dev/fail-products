// src/app/products/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ProductList } from "@/components/products/product-list";
import { ProductSearch } from "@/components/products/product-search";
import { StatusBadge } from "@/components/products/status-badge";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import { findCategoryBySlug } from "@/domain/product/category";
import {
  FAILURE_STATUSES,
  findFailureStatusBySlug,
} from "@/domain/product/failure-status";
import { listPublicDirectory } from "@/services/product/server-product";

export const metadata: Metadata = {
  title: "Products",
  description:
    "Browse products that failed, stalled, or never found traction, and read what their founders learned.",
  // Always the bare path. ?sort=, ?cursor=, ?q=, ?category= and ?status= render
  // the same listings filtered or reordered, and each is a duplicate of this
  // page rather than a page of its own (docs/PRODUCT.md §9). The indexable
  // address for a category or a status is /categories/[slug] or /status/[slug].
  alternates: { canonical: "/products" },
};

/**
 * The browse surface.
 *
 * This is the **only** public list that reads a query string, and that is now a
 * deliberate split rather than an accident of which page was written first.
 * `/categories/[slug]` and `/status/[slug]` are cacheable landing pages that
 * take no parameters (ADR-027); everything that needs a parameter — a sort, a
 * cursor, a search term, a filter — happens here, on the one route that was
 * always going to be dynamic because of the search box.
 *
 * `docs/DEPLOYMENT.md` §11 is what forces the split: an uncached list page
 * queries Neon on every crawler hit, and the egress allowance is the budget
 * that runs out first.
 */
export default async function ProductsPage({
  searchParams,
}: PageProps<"/products">) {
  const params = await searchParams;

  // Every parameter is untrusted: this page is public and unauthenticated. Each
  // one is resolved against a domain allowlist rather than passed through to a
  // query — an unknown value narrows nothing rather than 404ing a browse page,
  // which is the same reading `parseProductSort` takes of a stale bookmark.
  const category =
    typeof params.category === "string"
      ? findCategoryBySlug(params.category)
      : undefined;
  const status =
    typeof params.status === "string"
      ? findFailureStatusBySlug(params.status)
      : undefined;

  const page = await listPublicDirectory({
    sort: params.sort,
    cursor: params.cursor,
    search: params.q,
    categoryId: category?.id,
    failureStatus: status?.value,
  });

  const query = typeof params.q === "string" ? params.q : "";

  // Carried across a sort change and a page step, so narrowing the list and
  // then paging through it does not silently drop the filter.
  const preservedParams: Record<string, string> = {};
  if (category) preservedParams.category = category.slug;
  if (status) preservedParams.status = status.slug;
  if (query) preservedParams.q = query;

  const filters = [
    category
      ? { key: "category", label: category.name, href: `/categories/${category.slug}` }
      : null,
    status
      ? { key: "status", label: status.label, href: `/status/${status.slug}` }
      : null,
  ].filter((filter) => filter !== null);

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

          {filters.length > 0 ? (
            <div
              role="group"
              aria-label="Active filters"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-sm text-muted-foreground">Filtered by</span>
              {filters.map((filter) => (
                <span
                  key={filter.key}
                  className="inline-flex h-8 items-center gap-2 rounded-4xl border px-3 text-sm"
                >
                  <Link
                    href={filter.href}
                    className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {filter.label}
                  </Link>
                  <Link
                    href={buildProductsHref({ ...preservedParams, [filter.key]: undefined })}
                    aria-label={`Remove the ${filter.label} filter`}
                    className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    &times;
                  </Link>
                </span>
              ))}
            </div>
          ) : null}

          <ul className="flex flex-wrap items-center gap-2">
            {FAILURE_STATUSES.map((entry) => (
              <li key={entry.value}>
                <Link
                  href={`/status/${entry.slug}`}
                  className="inline-flex rounded-4xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <StatusBadge status={entry.value} />
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
          preservedParams={preservedParams}
          emptyTitle="No products listed yet"
          emptyDescription="The directory is empty because nobody has published a listing. Someone has to fail first, and it may as well be on purpose."
        />
      </Container>
    </>
  );
}

/** `/products` with the given parameters, dropping the ones that are absent. */
function buildProductsHref(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/products?${query}` : "/products";
}
