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
            The Privacy Policy is still being drafted and reviewed. It must
            describe the actual data, processors, retention periods, and request
            path before public launch.
          </AlertDescription>
        </Alert>

        <p className="text-sm text-muted-foreground text-pretty">
          The development site can contain accounts and listings. This
          placeholder does not describe its data handling and must not be used
          as a production privacy notice.
        </p>

        <Button asChild variant="outline" size="lg" className="h-11 self-start">
          <Link href="/">Back to home</Link>
        </Button>
      </Container>
    </>
  );
}
