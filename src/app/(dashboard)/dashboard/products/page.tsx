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
import {
  listOwnedModerationNotices,
  listOwnedProducts,
} from "@/services/product/server-product";

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

/**
 * A published listing that is flagged, hidden, or removed must say so to its
 * owner — in terms, not as a one-word badge.
 *
 * The badge alone lived in a `hidden md:table-cell` column, so a founder on a
 * phone whose listing had been taken down saw an ordinary row and a public
 * 404. `docs/MODERATION.md` §10 requires a removal and appeal contact path,
 * and a path nobody can find is not one.
 */
function moderationNotice(
  state: string
): { label: string; explanation: string } | null {
  switch (state) {
    case "FLAGGED":
      return {
        label: "Flagged",
        explanation:
          "A moderator is looking at this listing. It is still public.",
      };
    case "HIDDEN":
      return {
        label: "Hidden",
        explanation:
          "This listing is not publicly visible while a moderator reviews it.",
      };
    case "REMOVED":
      return {
        label: "Removed",
        explanation: "This listing has been taken down and is not public.",
      };
    default:
      return null;
  }
}

export default async function DashboardProductsPage() {
  const user = await currentUserOrNull();

  // Both reads in parallel: neon-http sends each statement as its own request,
  // so sequencing them would cost a round trip for no reason.
  const [items, notices] = user
    ? await Promise.all([
        listOwnedProducts(user.id),
        listOwnedModerationNotices(user.id),
      ])
    : [[], []];

  const noticeByProduct = new Map(
    notices.map((entry) => [entry.productId, entry])
  );

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
                    const record = noticeByProduct.get(item.id);

                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          <span className="flex flex-col gap-1">
                            <span>{item.name}</span>
                            <span className="text-xs text-muted-foreground">
                              /products/{item.slug}
                            </span>

                            {/*
                              In the name cell, which is the one column that
                              survives to 360px. What the moderator was
                              required to record is shown to the person it is
                              about, with the date and a route to object.
                            */}
                            {notice ? (
                              <span className="mt-1 flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2.5 py-2 text-xs font-normal">
                                <span className="flex flex-wrap items-center gap-2">
                                  <Badge variant="secondary">
                                    {notice.label}
                                  </Badge>
                                  {record ? (
                                    <time
                                      dateTime={record.createdAt.toISOString()}
                                      className="text-muted-foreground"
                                    >
                                      {record.createdAt
                                        .toISOString()
                                        .slice(0, 10)}
                                    </time>
                                  ) : null}
                                </span>

                                <span className="text-muted-foreground text-pretty">
                                  {notice.explanation}
                                </span>

                                {record?.reason ? (
                                  // A moderator writes this, and a long
                                  // unbroken string in it would widen the
                                  // table on a phone.
                                  <span className="wrap-anywhere text-muted-foreground">
                                    Reason given: {record.reason}
                                  </span>
                                ) : null}

                                <Link
                                  href="/takedown"
                                  className="w-fit rounded-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                                >
                                  Ask about this or appeal
                                </Link>
                              </span>
                            ) : null}
                          </span>
                        </TableCell>

                        <TableCell className="hidden sm:table-cell">
                          <StatusBadge
                            status={item.failureStatus as FailureStatus}
                          />
                        </TableCell>

                        <TableCell className="hidden md:table-cell">
                          {/*
                            Publication only. A moderation state is still never
                            collapsed into it (ADR-013) — the two are shown
                            separately, and the moderation half moved to the
                            name cell so it does not vanish with this column.
                          */}
                          <Badge variant="outline">
                            {item.publicationState}
                          </Badge>
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
