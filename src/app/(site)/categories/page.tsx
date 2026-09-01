// src/app/categories/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import { listCategoriesWithCounts } from "@/services/product/server-product";

export const metadata: Metadata = {
  title: "Categories",
  description:
    "Browse failed and struggling products by what they were: the category tells you who else tried this.",
  alternates: { canonical: "/categories" },
};

/**
 * The category index.
 *
 * Counts come from the same visibility predicate as every list, so a category
 * can never advertise a number that includes drafts or hidden listings — the
 * count and the page behind it always agree.
 *
 * An empty category still renders. The taxonomy is fixed (ADR-026), so "no
 * listings in Fintech yet" is a true and useful statement about the directory;
 * hiding the row would instead suggest the category does not exist.
 */
export default async function CategoriesPage() {
  const categories = await listCategoriesWithCounts();

  return (
    <>
      <PageHeader
        title="Categories"
        description="Find the products that tried the same thing you are trying, and read why it did not work."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Categories" }]}
      />

      <Container className="py-10 sm:py-14">
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <li key={category.id} className="flex">
              <Card className="w-full">
                <CardHeader>
                  {/*
                    A real heading, not just styled text. CardTitle renders a
                    div, and an index of thirteen cards with no headings gives a
                    screen-reader user no way to move between them
                    (docs/DESIGN.md §10). ProductCard already does this.
                  */}
                  <CardTitle>
                    <h2>{category.name}</h2>
                  </CardTitle>
                  {category.description ? (
                    <CardDescription className="text-pretty">
                      {category.description}
                    </CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">
                    {category.productCount === 0
                      ? "No listings yet"
                      : `${category.productCount} listing${
                          category.productCount === 1 ? "" : "s"
                        }`}
                  </p>
                  <Link
                    href={`/categories/${category.slug}`}
                    className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium outline-none transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    Browse {category.name.toLowerCase()}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}
