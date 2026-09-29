// src/app/(marketing)/takedown/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import { legalContactEmail } from "@/lib/config/legal-contact";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Takedown / delist",
  description: "How a product owner or a third party can object to a listing and request removal.",
  // Placeholder policy text must never be indexed as if it were in force.
  robots: { index: false, follow: true },
};

export default function TakedownPage() {
  const contact = legalContactEmail();
  const isDevelopment = process.env.NODE_ENV === "development";

  return (
    <>
      <PageHeader
        title="Takedown and delist requests"
        description="A route for owners and third parties to object to a listing, correct it, or have it removed."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Takedown / delist" }]}
      />

      <Container width="prose" className="flex flex-col gap-8 py-12 sm:py-16">
        {contact ? (
          <>
            <p className="text-sm text-muted-foreground text-pretty">
              Anyone can request a correction, delisting, or information about
              their data without signing in. Email the project mailbox with the
              page URL, what you want changed, and a way to reach you. Do not
              send identity documents or passwords in the first message.
            </p>
            <Button asChild size="lg" className="h-11 self-start">
              <a href={`mailto:${contact}?subject=FailProducts%20content%20request`}>
                Email {contact}
              </a>
            </Button>
            <p className="text-sm text-muted-foreground text-pretty">
              The project will review the request and may ask for enough detail
              to verify ownership or identify the content. A product owner can
              also unpublish their own listing from the dashboard.
            </p>
          </>
        ) : (
          <>
            <Alert>
              <AlertTitle>Contact is being set up</AlertTitle>
              <AlertDescription>
                The project mailbox for correction, delisting, and data requests
                is not configured yet. This is not a working request path, and
                the site is not ready for public launch.
              </AlertDescription>
            </Alert>
            {isDevelopment ? (
              <p className="text-sm text-muted-foreground text-pretty">
                Layout example only: <strong>legal@failproducts.test</strong>
                . This reserved example address cannot receive requests.
              </p>
            ) : null}
          </>
        )}

        {isDevelopment ? (
          <section className="flex flex-col gap-3 text-sm">
            <h2 className="text-lg font-semibold">Sample request details</h2>
            <p className="text-muted-foreground">
              These are examples for reviewing the request process, not submitted
              requests or promises of an operating mailbox.
            </p>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>Correction: include the listing URL and the specific text to correct.</li>
              <li>Delist: include the listing URL and explain your connection to it.</li>
              <li>Data access: identify the account or content you are asking about.</li>
              <li>Erasure: identify the account or content and what you want removed.</li>
            </ul>
          </section>
        ) : null}

        <Button asChild variant="outline" size="lg" className="h-11 self-start">
          <Link href="/">Back to home</Link>
        </Button>
      </Container>
    </>
  );
}
