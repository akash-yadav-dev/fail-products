// src/components/products/status-badge.tsx
import * as React from "react";
import {
  Activity,
  Ghost,
  PowerOff,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  findFailureStatus,
  type FailureStatus,
} from "@/domain/product/failure-status";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

/**
 * Presentation for each failure status, per docs/DESIGN.md #4.
 *
 * Colour is never the only carrier of meaning: every badge also ships an icon
 * and the status label as text.
 */
const STATUS_PRESENTATION: Record<
  FailureStatus,
  { variant: BadgeVariant; icon: LucideIcon }
> = {
  STRUGGLING: { variant: "warning", icon: TrendingDown },
  LOW_TRACTION: { variant: "warning", icon: Activity },
  ABANDONED: { variant: "neutral", icon: Ghost },
  SHUT_DOWN: { variant: "destructive", icon: PowerOff },
  RECOVERING: { variant: "success", icon: TrendingUp },
};

export function StatusBadge({
  status,
  className,
}: {
  status: FailureStatus;
  className?: string;
}) {
  const definition = findFailureStatus(status);
  const { variant, icon: Icon } = STATUS_PRESENTATION[status];

  return (
    <Badge variant={variant} className={className}>
      <Icon aria-hidden="true" />
      {definition.label}
    </Badge>
  );
}
