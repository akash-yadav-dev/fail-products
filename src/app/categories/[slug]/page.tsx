// src/app/categories/[slug]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Category",
  description: "Products listed in this category on FailProducts.",
  // No category taxonomy exists yet, so nothing here should be indexed.
  robots: { index: false, follow: false },
};

export default async function CategoryPage({
  params,
}: PageProps<"/categories/[slug]">) {
  const { slug } = await params;

  return (
    <>
      <PageHeader
        title={slug}
        description="Category listing layout. No category data is connected yet."
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Categories", href: "/categories" },
          { label: slug },
        ]}
      />

      <Container className="py-10 sm:py-14">
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers />
            </EmptyMedia>
            <EmptyTitle>Nothing listed in this category</EmptyTitle>
            <EmptyDescription>
              Any slug resolves here for now. Once categories are real, an
              unknown slug will return a 404 instead.
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild variant="outline" className="h-10">
            <Link href="/categories">All categories</Link>
          </Button>
        </Empty>
      </Container>
    </>
  );
}
