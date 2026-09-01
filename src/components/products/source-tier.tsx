// src/components/products/source-tier.tsx
import * as React from "react";
import { MessageSquare, ShieldCheck, UserPen, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  findSourceTier,
  type SourceTier,
} from "@/domain/product/source-tier";
import { cn } from "@/lib/utils";

/**
 * The label that says where a statement came from.
 *
 * `docs/LEGAL.md` §3 makes an unlabelled assertion a defect, and specifically
 * calls out rendering a community opinion "in the visual position of a verified
 * fact". So the three tiers are deliberately not interchangeable skins of one
 * badge: the verified tier is the only one that reads as the site speaking, and
 * it is the only one given a solid, confident treatment.
 *
 * Colour never carries the meaning on its own — each tier ships an icon and its
 * label as text (`docs/DESIGN.md` §4, `docs/DESIGN.md` §10).
 */
type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

const TIER_PRESENTATION: Record<
  SourceTier,
  { variant: BadgeVariant; icon: LucideIcon }
> = {
  CREATOR_CLAIM: { variant: "outline", icon: UserPen },
  COMMUNITY_OPINION: { variant: "outline", icon: MessageSquare },
  VERIFIED_SIGNAL: { variant: "success", icon: ShieldCheck },
};

export function SourceTierBadge({
  tier,
  className,
}: {
  tier: SourceTier;
  className?: string;
}) {
  const definition = findSourceTier(tier);
  const { variant, icon: Icon } = TIER_PRESENTATION[tier];

  return (
    <Badge variant={variant} className={cn("font-normal", className)}>
      <Icon aria-hidden="true" />
      {definition.label}
    </Badge>
  );
}

/**
 * A block of content with its source tier attached above it.
 *
 * The tier is a sibling of the heading rather than a footnote under the text,
 * because the rule is about *visual position*: a label a reader meets after
 * they have already read the paragraph as fact has not done its job.
 */
export function SourcedSection({
  title,
  tier,
  children,
}: {
  title: string;
  tier: SourceTier;
  children: React.ReactNode;
}) {
  const definition = findSourceTier(tier);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <SourceTierBadge tier={tier} />
      </div>
      <p className="sr-only">{definition.description}</p>
      {children}
    </section>
  );
}
