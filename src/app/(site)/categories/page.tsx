// src/app/categories/page.tsx
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
  title: "Categories",
  description:
    "Browse failed and struggling products by what they were: the category tells you who else tried this.",
};

export default function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categories"
        description="Find the products that tried the same thing you are trying, and read why it did not work."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Categories" }]}
      />

      <Container className="py-10 sm:py-14">
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers />
            </EmptyMedia>
            <EmptyTitle>No categories yet</EmptyTitle>
            <EmptyDescription>
              Categories appear once products are listed against them. The
              taxonomy is deliberately not invented ahead of real listings.
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild variant="outline" className="h-10">
            <Link href="/products">Browse products</Link>
          </Button>
        </Empty>
      </Container>
    </>
  );
}
