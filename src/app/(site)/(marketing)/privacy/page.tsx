// src/app/(marketing)/privacy/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What FailProducts will collect, why, how long it is kept, and who processes it. Drafting in progress.",
  // Placeholder policy text must never be indexed as if it were in force.
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        title="Privacy Policy"
        description="What is collected, the lawful basis for it, how long it is kept, which processors touch it, and how to exercise your rights."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Privacy Policy" }]}
      />

      <Container width="prose" className="flex flex-col gap-8 py-12 sm:py-16">
        <Alert>
          <AlertTitle>Not published yet</AlertTitle>
          <AlertDescription>
            The Privacy Policy is being drafted and must be reviewed before public launch. It will name every processor and retention period before any account can be created.
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
