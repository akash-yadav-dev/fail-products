// src/app/(dashboard)/dashboard/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  Eye,
  MessageSquare,
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
import { currentUserOrNull } from "@/services/auth/current-user";
import { countCommentsAcross } from "@/services/comment/server-comment";
import { listOwnedProducts } from "@/services/product/server-product";
import {
  referralDailyAcross,
  referralTotals,
} from "@/services/referral/server-referral";
import { subscriberCountsByProduct } from "@/services/waitlist/server-waitlist";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your listings, waitlists, and referral activity.",
  robots: { index: false, follow: false },
};

/**
 * The creator overview (docs/PRODUCT.md §5.1, slice 4.4).
 *
 * **Every number here is one this site can honestly know**, and the two it
 * cannot are left visibly unmeasured rather than filled with a plausible
 * figure. That is the whole design constraint:
 *
 * - **Outbound clicks** are read from the referral rollup, never from
 *   `referral_events` — raw rows only exist for 30 days (ADR-018), so counting
 *   them would make a founder's history quietly shrink as it aged out. They are
 *   clicks, not visitors: a referral row carries no visitor identifier at all,
 *   so nothing here can be deduplicated per person and the label never claims
 *   otherwise.
 * - **Profile views and product views are not measured**, and the cards say so.
 *   A product page is prerendered and cached for five minutes (ADR-027), so
 *   most visits never reach the server — counting them means either making the
 *   page dynamic, which costs the launch-blocking cache metric
 *   `docs/DEPLOYMENT.md` §11 protects, or a client beacon that only counts
 *   people who ran our JavaScript. Both produce a number that looks like
 *   traffic and is not, which `docs/PRODUCT.md` §5.1 explicitly forbids
 *   claiming. Left unmeasured until there is a way to measure it honestly.
 *
 * **No chart library.** `docs/PRODUCT.md` §5.1 permits Recharts where a chart
 * materially improves understanding and says to avoid charts for data that is
 * clearer as a number. A handful of daily counts is clearer as a list, and
 * adding a charting dependency for it is the anticipatory complexity
 * `CLAUDE.md` §7 rules out. When there is enough history for a shape to be
 * worth seeing, that is a measurement and a dependency gate, not a guess.
 */

const RECENT_DAYS = 14;

export default async function DashboardPage() {
  const user = await currentUserOrNull();
  const products = user ? await listOwnedProducts(user.id) : [];
  const productIds = products.map((product) => product.id);

  // One round trip each, all at once. neon-http sends every statement as its
  // own request, so sequencing four reads costs three avoidable round trips.
  const [clicksByProduct, subscribers, comments, daily] = user
    ? await Promise.all([
        referralTotals(productIds),
        subscriberCountsByProduct(user.id),
        countCommentsAcross(productIds),
        referralDailyAcross(productIds, RECENT_DAYS),
      ])
    : [
        new Map<string, number>(),
        new Map<string, number>(),
        0,
        [] as { day: string; clicks: number }[],
      ];

  const totalClicks = sum(clicksByProduct.values());
  const totalSubscribers = sum(subscribers.values());

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

      <section
        aria-label="Your metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Outbound clicks"
          hint="Visitors this site sent on to your products. Clicks, not people — nothing here identifies a visitor."
          icon={MousePointerClick}
          value={formatCount(totalClicks)}
        />
        <MetricCard
          label="Waitlist signups"
          hint="Confirmed addresses waiting on a comeback"
          icon={Users}
          value={formatCount(totalSubscribers)}
        />
        <MetricCard
          label="Comments"
          hint="Public comments across your listings"
          icon={MessageSquare}
          value={formatCount(comments)}
        />
        {/*
          No value, deliberately. MetricCard renders "not being measured yet"
          rather than a zero, because a zero is a claim.
        */}
        <MetricCard
          label="Product views"
          hint="Not measured. Listing pages are served from a cache, so a view usually never reaches this site — a number here would be a guess."
          icon={Eye}
        />
        <MetricCard
          label="Profile views"
          hint="Not measured, for the same reason as product views."
          icon={UserRound}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Outbound clicks by day</CardTitle>
          <CardDescription>
            The last {RECENT_DAYS} days with any activity, across all your
            listings. Read from the daily summary, which is kept indefinitely —
            the click-by-click records behind it are deleted after 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {daily.length === 0 ? (
            <Empty className="border border-dashed py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Activity />
                </EmptyMedia>
                <EmptyTitle>Nothing has happened yet</EmptyTitle>
                <EmptyDescription>
                  {products.length === 0
                    ? "Activity appears once you have a published product and someone finds it. Nothing is being measured before then."
                    : "Nobody has followed a link to your products yet. This fills in as they do."}
                </EmptyDescription>
              </EmptyHeader>
              <Button asChild variant="outline" className="h-10">
                <Link href="/dashboard/products">Go to your products</Link>
              </Button>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-1">
              {daily.map((entry) => (
                <li
                  key={entry.day}
                  className="flex items-center justify-between gap-4 border-b border-border/60 py-2 text-sm last:border-0"
                >
                  <time dateTime={entry.day} className="text-muted-foreground">
                    {entry.day}
                  </time>
                  <span className="font-medium tabular-nums">
                    {formatCount(entry.clicks)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/** Grouped, so five figures do not read as one long digit string. */
function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
