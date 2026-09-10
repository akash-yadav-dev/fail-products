// src/components/products/product-card.tsx
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/products/status-badge";
import type { FailureStatus } from "@/domain/product/failure-status";
import type { ProductListItem } from "@/repositories/product-repository";

/**
 * One product in a list.
 *
 * `docs/DESIGN.md` §7 says a card has to answer four questions in a few
 * seconds: what is it, why is it here, is it alive, and why might it be
 * interesting. The layout it suggests is:
 *
 *     Logo  Product name      Status
 *           One-line pitch
 *           Category · Last updated
 *           Community comments · Referral signal
 *
 * The last row is still absent. Referral signals are Phase 4. Comment counts
 * shipped their table in Phase 3 and are **not** on the card, which is a
 * decision rather than an omission: a count per card is an aggregate over
 * `comments` on the hottest query in the application, and the alternative — a
 * denormalised `comment_count` on `products`, kept correct through inserts,
 * moderation changes and cascade deletes — is the Stage 2 work `CLAUDE.md` §7
 * says must be earned by a measurement. The measurement that earns it is the
 * first listing whose discussion is worth finding from a list; there are none
 * today. Rendering "0 comments" on every card until then would describe the
 * schema rather than the product, and a directory that looks uniformly dead is
 * the one thing this design cannot afford.
 *
 * A logo needs R2, which is Phase 1 slice 1.5 and still blocked on transport,
 * so the identity block falls back to the product's initial rather than
 * reserving empty space for an image that cannot load yet.
 */
export function ProductCard({ product }: { product: ProductListItem }) {
  const updated = product.updatedAt;

  // `relative` on the card is what the stretched link below anchors to.
  return (
    <Card className="relative h-full gap-0 py-0 ring-foreground/10 transition-[box-shadow] hover:ring-foreground/25">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted text-sm font-semibold text-muted-foreground"
            >
              {product.name.slice(0, 1).toUpperCase()}
            </span>

            <h3 className="min-w-0 text-base font-semibold tracking-tight">
              {/*
                The whole card is the target, but only the name is the link.
                A stretched link keeps the hit area large without nesting
                interactive elements, which is what breaks keyboard order.
              */}
              <Link
                href={`/products/${product.slug}`}
                className="after:absolute after:inset-0 after:rounded-xl outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
              >
                <span className="line-clamp-2">{product.name}</span>
              </Link>
            </h3>
          </div>

          <StatusBadge
            status={product.failureStatus as FailureStatus}
            className="shrink-0"
          />
        </div>

        {product.tagline ? (
          <p className="line-clamp-2 text-sm text-muted-foreground text-pretty">
            {product.tagline}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {product.categorySlug && product.categoryName ? (
            <>
              <Badge variant="outline" className="font-normal">
                {product.categoryName}
              </Badge>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span>
            Updated{" "}
            <time dateTime={updated.toISOString()}>
              {updated.toISOString().slice(0, 10)}
            </time>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
