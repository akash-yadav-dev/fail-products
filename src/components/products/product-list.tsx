// src/components/products/product-list.tsx
import Link from "next/link";
import { PackageOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ProductCard } from "@/components/products/product-card";
import {
  DEFAULT_PRODUCT_SORT,
  PRODUCT_SORTS,
  type ProductSort,
} from "@/domain/product/listing";
import type { ProductListItem } from "@/repositories/product-repository";
import { cn } from "@/lib/utils";

/**
 * A page of products, with its sort control and its next-page link.
 *
 * Shared by `/products`, `/status/[slug]`, `/categories/[slug]`, and search,
 * which is the component-level half of slice 2.1: the four surfaces differ only
 * in what they filter by, so they should differ only in what they pass here.
 *
 * Everything is a link, not a control. The list is server-rendered and the sort
 * and the next page are ordinary navigations, so the page works with no
 * JavaScript at all — `docs/PRODUCT.md` §9 requires meaningful visible content
 * without JavaScript dependence, and `ENGINEERING.md` §7 asks public pages to
 * avoid hydration that buys nothing.
 */

export type ProductListProps = {
  items: readonly ProductListItem[];
  sort: ProductSort;
  nextCursor: string | null;
  /** The path these links stay on — `/products`, `/status/abandoned`, and so on. */
  basePath: string;
  /** Query parameters to carry across a sort change or a page step. */
  preservedParams?: Record<string, string>;
  emptyTitle: string;
  emptyDescription: string;
};

/**
 * Builds a URL on the current page, preserving the parameters that describe
 * what the visitor is looking at and dropping the ones that do not apply.
 *
 * The cursor is dropped on a sort change on purpose: a position in one ordering
 * is meaningless in another, and carrying it over would open page 2 of a list
 * the visitor has never seen page 1 of.
 */
function buildHref(
  basePath: string,
  params: Record<string, string | null | undefined>
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function ProductList({
  items,
  sort,
  nextCursor,
  basePath,
  preservedParams = {},
  emptyTitle,
  emptyDescription,
}: ProductListProps) {
  if (items.length === 0) {
    return (
      <Empty className="border py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageOpen />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
        <Button asChild variant="outline" className="h-10">
          <Link href="/submit">Submit a product</Link>
        </Button>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Sort products" className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Sort</span>
        {PRODUCT_SORTS.map((option) => {
          const isCurrent = option.value === sort;

          return (
            <Link
              key={option.value}
              href={buildHref(basePath, {
                ...preservedParams,
                // The default is the bare URL: one canonical address for the
                // default view, rather than two that render the same list.
                sort: option.value === DEFAULT_PRODUCT_SORT ? null : option.value,
              })}
              aria-current={isCurrent ? "true" : undefined}
              className={cn(
                "inline-flex h-8 items-center rounded-4xl border px-3 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                isCurrent
                  ? "border-transparent bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </nav>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((product) => (
          <li key={product.id} className="flex">
            <ProductCard product={product} />
          </li>
        ))}
      </ul>

      {nextCursor ? (
        <div className="flex justify-center pt-2">
          <Button asChild variant="outline" className="h-11">
            <Link
              href={buildHref(basePath, {
                ...preservedParams,
                sort: sort === DEFAULT_PRODUCT_SORT ? null : sort,
                cursor: nextCursor,
              })}
              rel="next"
            >
              Load more
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
