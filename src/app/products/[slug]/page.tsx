// src/app/products/[slug]/page.tsx
import type { Metadata } from "next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Product",
  description: "A product listing on FailProducts.",
  // No product data exists yet, so nothing here should be indexed.
  robots: { index: false, follow: false },
};

/**
 * Layout preview for a product page.
 *
 * The section order follows docs/DESIGN.md #6. There is no data layer yet, so
 * every content region renders a skeleton rather than invented product facts.
 */
const SECTIONS = [
  { title: "Why it is listed", lines: 3 },
  { title: "What went wrong", lines: 4 },
  { title: "What I would do differently", lines: 3 },
  { title: "Screenshots and evidence", lines: 2 },
  { title: "Community discussion", lines: 3 },
  { title: "Related products", lines: 2 },
] as const;

const FACT_LABELS = [
  "Status",
  "Category",
  "Launched",
  "Last active",
  "Website",
] as const;

export default async function ProductPage({
  params,
}: PageProps<"/products/[slug]">) {
  const { slug } = await params;

  return (
    <>
      <PageHeader
        title={slug}
        description="Product listing layout. No product data is connected yet."
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Products", href: "/products" },
          { label: slug },
        ]}
      />

      <Container className="py-10 sm:py-14">
        <Alert className="mb-8">
          <AlertTitle>Layout preview</AlertTitle>
          <AlertDescription>
            This route renders the product page structure so it can be
            reviewed. It looks nothing up, and any slug resolves here.
          </AlertDescription>
        </Alert>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
          <div className="flex flex-col gap-8">
            {SECTIONS.map((section) => (
              <section key={section.title} className="flex flex-col gap-3">
                <h2 className="text-xl font-semibold tracking-tight">
                  {section.title}
                </h2>
                <div className="flex flex-col gap-2">
                  {Array.from({ length: section.lines }).map((_, index) => (
                    <Skeleton key={index} className="h-4 w-full last:w-2/3" />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Core facts</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {FACT_LABELS.map((label) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-sm text-muted-foreground">
                      {label}
                    </span>
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Founder</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </CardContent>
            </Card>

            <Separator />

            <Card>
              <CardHeader>
                <CardTitle>Waitlist</CardTitle>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-11 w-full" />
              </CardContent>
            </Card>
          </aside>
        </div>
      </Container>
    </>
  );
}
