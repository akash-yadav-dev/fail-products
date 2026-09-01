// src/app/(marketing)/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Layers, MessageSquare, Search } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SiteLogo } from "@/components/layout/site-logo";
import { StatusBadge } from "@/components/products/status-badge";
import { Container } from "@/components/shared/container";
import { SiteJsonLd } from "@/components/shared/structured-data";
import { FAILURE_STATUSES } from "@/domain/product/failure-status";
import { siteConfig } from "@/lib/config/site";

export const metadata: Metadata = {
  // The home page's own canonical. Without one, the site's most-linked URL is
  // the only public page that does not name itself.
  alternates: { canonical: "/" },
};

const HOW_IT_WORKS = [
  {
    icon: Search,
    title: "Find the failure",
    body: "Browse products that struggled, stalled, or shut down — and read what actually happened.",
  },
  {
    icon: MessageSquare,
    title: "Roast the product",
    body: "Say what was unclear, unwanted, or mispriced. Criticise the product, never the person.",
  },
  {
    icon: Layers,
    title: "Help the builder",
    body: "Founders own their listing, answer in the thread, and update the status when things change.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      {/* The site's own identity, once, here. Nothing about a listed product. */}
      <SiteJsonLd />

      <section className="border-b border-border/60">
        <Container className="flex flex-col items-center gap-6 py-16 text-center sm:py-24">
          <SiteLogo size="lg" withWordmark={false} priority />

          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            A directory of products that failed, stalled, or never found
            traction.
          </h1>

          <p className="max-w-xl text-lg text-muted-foreground text-pretty">
            {siteConfig.tagline}
          </p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button asChild size="lg" className="h-11 w-full sm:w-auto">
              <Link href="/products">
                Browse products
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-11 w-full sm:w-auto"
            >
              <Link href="/submit">Submit your product</Link>
            </Button>
          </div>

          <ul className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {FAILURE_STATUSES.map((status) => (
              <li key={status.value}>
                <StatusBadge status={status.value} />
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="border-b border-border/60">
        <Container className="py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {HOW_IT_WORKS.map((step) => (
              <Card key={step.title}>
                <CardHeader>
                  <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                    <step.icon className="size-4" aria-hidden="true" />
                  </div>
                  <CardTitle className="mt-3">{step.title}</CardTitle>
                  <CardDescription className="text-pretty">
                    {step.body}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-16 sm:py-20">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Browse by status</CardTitle>
                <CardDescription>
                  Struggling, low traction, abandoned, shut down, recovering.
                  Status is owner-controlled and changes as the product does.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link href="/status">
                    See statuses
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Browse by category</CardTitle>
                <CardDescription>
                  Find the products that tried the same thing you are trying,
                  and read why it did not work.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link href="/categories">
                    See categories
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <Alert className="mt-8">
            <AlertTitle>This is the skeleton, not the product</AlertTitle>
            <AlertDescription>
              Layout, navigation, theming, and routes are in place. Listings,
              accounts, comments, and waitlists are not built yet, so every
              page below renders an empty state rather than sample data.
            </AlertDescription>
          </Alert>
        </Container>
      </section>
    </>
  );
}
