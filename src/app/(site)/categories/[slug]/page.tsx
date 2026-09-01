// src/app/categories/[slug]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductList } from "@/components/products/product-list";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import {
  PRODUCT_CATEGORIES,
  findCategoryBySlug,
} from "@/domain/product/category";
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
 */
export function generateStaticParams() {
  return PRODUCT_CATEGORIES.map((category) => ({ slug: category.slug }));
}

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
  searchParams,
}: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const category = findCategoryBySlug(slug);

  // The page used to resolve for any value at all. It does not any more.
  if (!category) notFound();

  const query = await searchParams;
  const page = await listPublicDirectory({
    categoryId: category.id,
    sort: query.sort,
    cursor: query.cursor,
  });

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

      <Container className="py-10 sm:py-14">
        <ProductList
          items={page.items}
          sort={page.sort}
          nextCursor={page.nextCursor}
          basePath={`/categories/${category.slug}`}
          emptyTitle={`Nothing listed under ${category.name} yet`}
          emptyDescription="No published listing carries this category. If you built one that did not work out, it belongs here."
        />
      </Container>
    </>
  );
}
