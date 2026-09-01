// src/app/(dashboard)/dashboard/products/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PackagePlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { StatusBadge } from "@/components/products/status-badge";
import type { FailureStatus } from "@/domain/product/failure-status";
import { currentUserOrNull } from "@/services/auth/current-user";
import { listOwnedProducts } from "@/services/product/server-product";

export const metadata: Metadata = {
  title: "Your products",
  description: "The products you have listed on FailProducts.",
  robots: { index: false, follow: false },
};

const COLUMNS = [
  { key: "product", label: "Product", className: "" },
  { key: "status", label: "Status", className: "hidden sm:table-cell" },
  { key: "publication", label: "Publication", className: "hidden md:table-cell" },
  { key: "updated", label: "Updated", className: "hidden lg:table-cell" },
] as const;

/** A published listing that is hidden or removed must say so to its owner. */
function moderationNotice(state: string): string | null {
  switch (state) {
    case "FLAGGED":
      return "Flagged";
    case "HIDDEN":
      return "Hidden";
    case "REMOVED":
      return "Removed";
    default:
      return null;
  }
}

export default async function DashboardProductsPage() {
  const user = await currentUserOrNull();
  const items = user ? await listOwnedProducts(user.id) : [];

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
          <p className="text-xs text-muted-foreground sm:ml-auto">
            {items.length === 0
              ? "No listings yet"
              : `${items.length} listing${items.length === 1 ? "" : "s"}`}
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
                {items.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={COLUMNS.length} className="p-0">
                      <Empty className="border-0 py-14">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <PackagePlus />
                          </EmptyMedia>
                          <EmptyTitle>You have not listed anything</EmptyTitle>
                          <EmptyDescription>
                            List a product you built. It stays a draft until you
                            publish it.
                          </EmptyDescription>
                        </EmptyHeader>
                        <Button asChild variant="outline" className="h-10">
                          <Link href="/submit">Submit a product</Link>
                        </Button>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const notice = moderationNotice(item.moderationState);

                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          <span className="flex flex-col gap-1">
                            <span>{item.name}</span>
                            <span className="text-xs text-muted-foreground">
                              /products/{item.slug}
                            </span>
                          </span>
                        </TableCell>

                        <TableCell className="hidden sm:table-cell">
                          <StatusBadge
                            status={item.failureStatus as FailureStatus}
                          />
                        </TableCell>

                        <TableCell className="hidden md:table-cell">
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">
                              {item.publicationState}
                            </Badge>
                            {/*
                              A moderation state is never collapsed into the
                              publication one (ADR-013): a listing can be
                              published and flagged at the same time, and the
                              owner has to be able to see both.
                            */}
                            {notice ? (
                              <Badge variant="secondary">{notice}</Badge>
                            ) : null}
                          </span>
                        </TableCell>

                        <TableCell className="hidden lg:table-cell text-muted-foreground">
                          <time dateTime={item.updatedAt.toISOString()}>
                            {item.updatedAt.toISOString().slice(0, 10)}
                          </time>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
