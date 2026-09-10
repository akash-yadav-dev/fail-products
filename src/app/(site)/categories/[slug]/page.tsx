// src/app/categories/[slug]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ProductList } from "@/components/products/product-list";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import {
  PRODUCT_CATEGORIES,
  findCategoryBySlug,
} from "@/domain/product/category";
import { DEFAULT_PRODUCT_SORT } from "@/domain/product/listing";
import { listPublicDirectory } from "@/services/product/server-product";

/**
 * One category.
 *
 * The taxonomy is fixed (ADR-026), so every page here is known at build time
 * and an unknown slug is a 404 rather than an empty page. That was the whole
 * point of resolving open question 5 before this slice: a free-form taxonomy
 * would make every mistyped slug a soft 404 for search engines to index, which
 * `docs/PRODUCT.md` §9 explicitly forbids.
 *
 * The category is resolved from the domain list rather than the table. The list
 * is the specification; the table is its copy, and an integration test holds
 * them together.
 *
 * **This page takes no query parameters** (ADR-027). It used to read `sort` and
 * `cursor`, which made it dynamically rendered — and `docs/DEPLOYMENT.md` §11
 * names the cache hit ratio here launch-blocking, because an uncached list
 * queries Neon on every crawler hit and egress is the allowance that runs out
 * first. Sorting and paging live on `/products`, which is dynamic anyway
 * because of the search box.
 */
export function generateStaticParams() {
  return PRODUCT_CATEGORIES.map((category) => ({ slug: category.slug }));
}

/** Five minutes, matching `/products/[slug]`: short enough to need no explicit
 * invalidation when a listing is published, long enough to take the repeated
 * crawler hit off the database. */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = findCategoryBySlug(slug);

  if (!category) {
    return { title: "Category not found", robots: { index: false, follow: false } };
  }

  return {
    title: category.name,
    description: `Products listed under ${category.name} on FailProducts. ${category.description}`,
    alternates: { canonical: `/categories/${category.slug}` },
  };
}

export default async function CategoryPage({
  params,
}: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const category = findCategoryBySlug(slug);

  // The page used to resolve for any value at all. It does not any more.
  if (!category) notFound();

  const page = await listPublicDirectory({ categoryId: category.id });

  return (
    <>
      <PageHeader
        title={category.name}
        description={category.description}
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Categories", href: "/categories" },
          { label: category.name },
        ]}
      />

      <Container className="flex flex-col gap-8 py-10 sm:py-14">
        <ProductList
          items={page.items}
          sort={DEFAULT_PRODUCT_SORT}
          nextCursor={null}
          showSort={false}
          basePath={`/categories/${category.slug}`}
          emptyTitle={`Nothing listed under ${category.name} yet`}
          emptyDescription="No published listing carries this category. If you built one that did not work out, it belongs here."
        />

        {/*
          Where the parameters went. The deeper browse — sort, page two, a
          search inside the category — is one navigation away, on the route
          that carries query strings.

          Rendered only when the page is actually truncated. Offering to
          "browse every listing" under a category holding three of them
          promised a fuller list that does not exist, and the page said
          nothing about being a partial view in the first place.
        */}
        {page.truncated ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Showing the newest {page.items.length}.
            </p>
            <Button asChild variant="outline" className="h-11">
              <Link href={`/products?category=${category.slug}`}>
                Browse and sort every {category.name} listing
              </Link>
            </Button>
          </div>
        ) : null}
      </Container>
    </>
  );
}
