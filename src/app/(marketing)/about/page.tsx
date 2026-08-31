// src/app/(marketing)/about/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import { siteConfig } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why FailProducts exists, who runs it, and the rules the directory operates under.",
};

export default function AboutPage() {
  return (
    <>
      <PageHeader
        title="About FailProducts"
        description="Most products fail quietly. This directory makes the failures discoverable, discussable, and useful to the next builder."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "About" }]}
      />

      <Container width="prose" className="flex flex-col gap-8 py-12 sm:py-16">
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">What this is</h2>
          <p className="text-muted-foreground text-pretty">
            An open, public record of products that struggled, stalled, were
            abandoned, or shut down — written up by the people who built them,
            and discussed openly by everyone else.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">
            Who can list a product
          </h2>
          <p className="text-muted-foreground text-pretty">
            Only a product&rsquo;s founder or owner can publish it. Listing
            someone else&rsquo;s product is out of scope until a consent,
            objection, and takedown system exists.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">
            The one rule that matters
          </h2>
          <p className="text-muted-foreground text-pretty">
            {siteConfig.tagline} Criticise the product, the decisions, and the
            positioning. Never the person.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Open source</h2>
          <p className="text-muted-foreground text-pretty">
            The site is built in the open and licensed {siteConfig.license}.
            The {siteConfig.name} name and logo are excluded from that licence.
          </p>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-11">
            <Link href="/submit">Submit your product</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-11">
            <Link href="/guidelines">Read the guidelines</Link>
          </Button>
        </div>
      </Container>
    </>
  );
}
