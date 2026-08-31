// src/app/(dashboard)/dashboard/page.tsx
import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your listings, waitlists, and referral activity.",
  robots: { index: false, follow: false },
};

/** docs/PRODUCT.md #5.1 - basic creator analytics. */
const METRICS = [
  { label: "Profile views", hint: "People who opened your profile" },
  { label: "Product page views", hint: "Views across your listings" },
  { label: "Outbound clicks", hint: "Visitors sent to your product" },
  { label: "Waitlist signups", hint: "People waiting on a comeback" },
] as const;

export default function DashboardPage() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {METRICS.map((metric) => (
        <Card key={metric.label}>
          <CardHeader>
            <CardDescription>{metric.label}</CardDescription>
            <CardTitle className="text-2xl">
              <Skeleton className="h-7 w-16" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground text-pretty">
              {metric.hint}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
