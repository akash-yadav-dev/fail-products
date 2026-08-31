// src/app/(dashboard)/dashboard/products/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PackagePlus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";

export const metadata: Metadata = {
  title: "Your products",
  description: "The products you have listed on FailProducts.",
  robots: { index: false, follow: false },
};

/**
 * The columns the listings table will have. Declared here so the empty table
 * shows the real shape of the data rather than a placeholder that will not
 * match what Phase 1 delivers.
 */
const COLUMNS = [
  { key: "product", label: "Product", className: "" },
  { key: "status", label: "Status", className: "hidden sm:table-cell" },
  { key: "publication", label: "Publication", className: "hidden md:table-cell" },
  { key: "views", label: "Views", className: "hidden lg:table-cell text-right" },
  { key: "updated", label: "Updated", className: "hidden lg:table-cell" },
] as const;

export default function DashboardProductsPage() {
  return (
    <>
      <DashboardPageHeader
        title="Products"
        description="Only the person who built a product may list it, so everything here is yours."
        actions={
          <Button asChild className="h-10">
            <Link href="/submit">Submit a product</Link>
          </Button>
        }
      />

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center">
          {/*
            Disabled, with no action, until there is something to filter.
            docs/AI-WORKFLOW.md: nothing in the skeleton pretends to work.
          */}
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Filter your products"
              className="h-10 pl-9"
              disabled
              aria-label="Filter your products (available once you have listings)"
            />
          </div>
          <p className="text-xs text-muted-foreground sm:ml-auto">
            No listings yet
          </p>
        </div>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((column) => (
                    <TableHead key={column.key} className={column.className}>
                      {column.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={COLUMNS.length} className="p-0">
                    <Empty className="border-0 py-14">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <PackagePlus />
                        </EmptyMedia>
                        <EmptyTitle>You have not listed anything</EmptyTitle>
                        <EmptyDescription>
                          Your listings will appear here once submissions open.
                          Only you can publish a product you built.
                        </EmptyDescription>
                      </EmptyHeader>
                      <Button asChild variant="outline" className="h-10">
                        <Link href="/submit">Read the submission rules</Link>
                      </Button>
                    </Empty>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
