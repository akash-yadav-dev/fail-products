// src/app/(marketing)/submit/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import { SubmitForm } from "@/components/products/submit-form";
import { currentUserOrNull } from "@/services/auth/current-user";
import { submitProductAction } from "./actions";

export const metadata: Metadata = {
  title: "Submit a product",
  description:
    "List a product you built. Owner-only: a product may only be published by its founder or owner.",
};

const REQUIREMENTS = [
  "You are the founder or owner of the product.",
  "The product is real and was publicly available at some point.",
  "You can describe what happened honestly, including what went wrong.",
  "You accept that the listing is public and open to community discussion.",
] as const;

export default async function SubmitPage() {
  const user = await currentUserOrNull();

  return (
    <>
      <PageHeader
        title="Submit a product"
        description="Listings are owner-only. A product may only be published by the person who built it."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Submit" }]}
      />

      <Container width="prose" className="flex flex-col gap-8 py-12 sm:py-16">
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight">
            Before you start
          </h2>
          <ul className="flex flex-col gap-3">
            {REQUIREMENTS.map((requirement) => (
              <li key={requirement} className="flex items-start gap-3">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                <span className="text-sm text-muted-foreground text-pretty">
                  {requirement}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {user ? (
          <SubmitForm action={submitProductAction} />
        ) : (
          <>
            <Alert>
              <AlertTitle>Sign in to list a product</AlertTitle>
              <AlertDescription>
                Listings are owner-only, so the form needs to know who you are
                before it can attach a product to you.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11">
                <Link href="/auth/sign-in">Sign in to continue</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11">
                <Link href="/guidelines">Read the guidelines</Link>
              </Button>
            </div>
          </>
        )}
      </Container>
    </>
  );
}
