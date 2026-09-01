// src/app/status/page.tsx
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
import { StatusBadge } from "@/components/products/status-badge";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import { FAILURE_STATUSES } from "@/domain/product/failure-status";

export const metadata: Metadata = {
  title: "Status",
  description:
    "Struggling, low traction, abandoned, shut down, recovering. What each product status means on FailProducts.",
  alternates: { canonical: "/status" },
};

export default function StatusIndexPage() {
  return (
    <>
      <PageHeader
        title="Status"
        description="A product's status says what it is doing right now. Owners control it, and it changes as the product does."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Status" }]}
      />

      <Container className="py-10 sm:py-14">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FAILURE_STATUSES.map((status) => (
            <Card key={status.value} className="group/status">
              <CardHeader>
                <StatusBadge status={status.value} className="mb-2" />
                <CardTitle>{status.label}</CardTitle>
                <CardDescription className="text-pretty">
                  {status.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href={`/status/${status.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium outline-none transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  See {status.label.toLowerCase()} products
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </>
  );
}
