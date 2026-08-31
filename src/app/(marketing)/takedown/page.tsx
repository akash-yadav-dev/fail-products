// src/app/(marketing)/takedown/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Takedown / delist",
  description: "How a product owner or a third party can object to a listing and request removal.",
  // Placeholder policy text must never be indexed as if it were in force.
  robots: { index: false, follow: true },
};

export default function TakedownPage() {
  return (
    <>
      <PageHeader
        title="Takedown and delist requests"
        description="A route for owners and third parties to object to a listing, correct it, or have it removed."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Takedown / delist" }]}
      />

      <Container width="prose" className="flex flex-col gap-8 py-12 sm:py-16">
        <Alert>
          <AlertTitle>Not published yet</AlertTitle>
          <AlertDescription>
            The takedown route and its response commitment are being defined and will be published before listings open. Until then there is nothing published to object to.
          </AlertDescription>
        </Alert>

        <p className="text-sm text-muted-foreground text-pretty">
          Nothing on this page is in force today. No accounts exist, no
          listings are published, and no user data is collected by this site.
        </p>

        <Button asChild variant="outline" size="lg" className="h-11 self-start">
          <Link href="/">Back to home</Link>
        </Button>
      </Container>
    </>
  );
}
