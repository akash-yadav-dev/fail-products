// src/components/dashboard/metric-card.tsx
import type { LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * One creator metric (docs/PRODUCT.md §5.1).
 *
 * `value` is optional on purpose. There is no data layer yet, and a card that
 * printed "0" or "1,204" would be asserting something untrue about the reader's
 * account — the skeleton says "not measured yet" without pretending otherwise.
 */
export function MetricCard({
  label,
  hint,
  icon: Icon,
  value,
}: {
  label: string;
  hint: string;
  icon: LucideIcon;
  value?: string;
}) {
  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardDescription className="text-xs font-medium tracking-wide uppercase">
          {label}
        </CardDescription>
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <CardTitle className="text-2xl font-semibold tabular-nums">
          {value ?? (
            <Skeleton
              className="h-7 w-16"
              // Not a loading state: there is nothing to load yet.
              aria-label={`${label} is not being measured yet`}
            />
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground text-pretty">{hint}</p>
      </CardContent>
    </Card>
  );
}
