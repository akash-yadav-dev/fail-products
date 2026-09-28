// src/app/(marketing)/terms/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that will govern use of FailProducts. Drafting in progress ahead of public launch.",
  // Placeholder policy text must never be indexed as if it were in force.
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return (
    <>
      <PageHeader
        title="Terms of Service"
        description="The terms covering acceptable use, the content licence you grant, liability, and termination."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Terms of Service" }]}
      />

      <Container width="prose" className="flex flex-col gap-8 py-12 sm:py-16">
        <Alert>
          <AlertTitle>Not published yet</AlertTitle>
          <AlertDescription>
            The Terms of Service are still being drafted and reviewed. This
            placeholder does not set terms for a public service; a dated policy
            is required before launch.
          </AlertDescription>
        </Alert>

        <p className="text-sm text-muted-foreground text-pretty">
          The development site can contain accounts and listings. Their presence
          does not mean this policy is complete or that the site is ready for
          public use.
        </p>

        <Button asChild variant="outline" size="lg" className="h-11 self-start">
          <Link href="/">Back to home</Link>
        </Button>
      </Container>
    </>
  );
}
