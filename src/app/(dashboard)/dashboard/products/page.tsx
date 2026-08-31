// src/app/(dashboard)/dashboard/products/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export const metadata: Metadata = {
  title: "Your products",
  description: "The products you have listed on FailProducts.",
  robots: { index: false, follow: false },
};

export default function DashboardProductsPage() {
  return (
    <Empty className="border py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Plus />
        </EmptyMedia>
        <EmptyTitle>You have not listed anything</EmptyTitle>
        <EmptyDescription>
          Your listings will appear here once submissions open. Only you can
          publish a product you built.
        </EmptyDescription>
      </EmptyHeader>
      <Button asChild variant="outline" className="h-10">
        <Link href="/submit">Read the submission rules</Link>
      </Button>
    </Empty>
  );
}
