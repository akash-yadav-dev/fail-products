// src/app/(dashboard)/dashboard/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  Eye,
  MousePointerClick,
  Users,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { MetricCard } from "@/components/dashboard/metric-card";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your listings, waitlists, and referral activity.",
  robots: { index: false, follow: false },
};

/** docs/PRODUCT.md §5.1 — basic creator analytics. */
const METRICS = [
  {
    label: "Profile views",
    hint: "People who opened your profile",
    icon: UserRound,
  },
  {
    label: "Product views",
    hint: "Views across all of your listings",
    icon: Eye,
  },
  {
    label: "Outbound clicks",
    hint: "Visitors sent on to your product",
    icon: MousePointerClick,
  },
  {
    label: "Waitlist signups",
    hint: "People waiting on a comeback",
    icon: Users,
  },
] as const;

export default function DashboardPage() {
  return (
    <>
      <DashboardPageHeader
        title="Overview"
        description="What FailProducts sent to your products, and who is waiting on them."
        actions={
          <Button asChild className="h-10">
            <Link href="/submit">Submit a product</Link>
          </Button>
        }
      />

      <section aria-label="Your metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRICS.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>
            Views, clicks, comments, and waitlist signups across your listings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="border border-dashed py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Activity />
              </EmptyMedia>
              <EmptyTitle>Nothing has happened yet</EmptyTitle>
              <EmptyDescription>
                Activity appears once you have a published product and someone
                finds it. Nothing is being measured before then.
              </EmptyDescription>
            </EmptyHeader>
            <Button asChild variant="outline" className="h-10">
              <Link href="/dashboard/products">Go to your products</Link>
            </Button>
          </Empty>
        </CardContent>
      </Card>
    </>
  );
}
