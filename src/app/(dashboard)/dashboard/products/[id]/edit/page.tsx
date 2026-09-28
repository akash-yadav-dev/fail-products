// src/app/(dashboard)/dashboard/products/[id]/edit/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { EditProductForm } from "@/components/products/edit-form";
import { StatusBadge } from "@/components/products/status-badge";
import { StatusForm } from "@/components/products/status-form";
import type { FailureStatus } from "@/domain/product/failure-status";
import { currentUserOrNull } from "@/services/auth/current-user";
import { findEditableProduct } from "@/services/product/server-product";
import { changeFailureStatusAction, updateProductAction } from "../../actions";

export const metadata: Metadata = {
  title: "Edit listing",
  // Behind a session and an ownership check, so a crawler only ever sees the
  // 404 — but the route is named here so it cannot end up in a sitemap later.
  robots: { index: false, follow: false },
};

/**
 * Edit one of the signed-in account's listings.
 *
 * **404, not 403, for a listing that is not this account's.** The read
 * (`findEditableProduct`) returns null for "no such product" and for "not
 * yours" alike, so the route cannot be used to discover which product ids
 * exist. The check here decides what renders; it is not what protects the
 * actions — each re-loads the product and authorises it in the service,
 * because a Server Action is a public endpoint whether or not this page
 * rendered a form for it (`docs/SECURITY.md` §3).
 *
 * Publication is not controlled here. It lives on the products list, which is
 * where the submit flow lands, so a new draft has exactly one obvious next
 * action rather than two half-obvious ones.
 */
export default async function EditProductPage({
  params,
}: PageProps<"/dashboard/products/[id]/edit">) {
  const { id } = await params;
  const user = await currentUserOrNull();

  const product = await findEditableProduct({ userId: user?.id ?? null }, id);
  if (!product) notFound();

  const isPublished = product.publicationState === "PUBLISHED";
  const isPublic =
    isPublished &&
    (product.moderationState === "NONE" || product.moderationState === "FLAGGED");

  return (
    <>
      <DashboardPageHeader
        title={product.name}
        description={
          <>
            Editing your own listing. {isPublic ? (
              <>
                The public page is{" "}
                <Link
                  href={`/products/${product.slug}`}
                  className="rounded-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  /products/{product.slug}
                </Link>
                .
              </>
            ) : isPublished ? (
              "This listing is published but hidden by moderation."
            ) : (
              "This listing is not public yet."
            )}
          </>
        }
        actions={
          <Button asChild variant="outline" className="h-10">
            <Link href="/dashboard/products">Back to products</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Listing details</CardTitle>
              <CardDescription>
                What visitors read on the public page. Changing the name moves
                the web address too, and the old one keeps working.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EditProductForm product={product} action={updateProductAction} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
              <CardDescription>
                Your own account of what the product is doing. Only you can
                change it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatusForm
                productId={product.id}
                current={product.failureStatus as FailureStatus}
                action={changeFailureStatusAction}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Publication</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-3 text-sm">
              <StatusBadge status={product.failureStatus as FailureStatus} />
              <p className="text-muted-foreground">
                {isPublic
                  ? "Live on the public directory."
                  : isPublished
                    ? "Published, but hidden from the public directory by moderation."
                    : `Currently ${product.publicationState.toLowerCase()}. It is not on the public directory.`}
              </p>
              {product.categorySlug ? (
                <p className="text-muted-foreground">
                  Filed under{" "}
                  <Link
                    href={`/categories/${product.categorySlug}`}
                    className="rounded-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {product.categorySlug}
                  </Link>
                  .
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Not filed under a category, so it will not appear on a
                  category page.
                </p>
              )}
              <Button asChild variant="outline" size="sm" className="h-9">
                <Link href="/dashboard/products">
                  {isPublished ? "Unpublish from the list" : "Publish from the list"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
