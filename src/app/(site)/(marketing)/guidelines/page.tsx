// src/app/(marketing)/guidelines/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Content guidelines",
  description:
    "What may be listed, how comments are expected to read, and how moderation works.",
};

const ALLOWED = [
  "Products you built that struggled, stalled, or shut down.",
  "Honest accounts of what went wrong and what you would do differently.",
  "Criticism aimed at the product, the positioning, or the decisions.",
] as const;

const NOT_ALLOWED = [
  "Attacks on a person rather than the product.",
  "Claims presented as fact without a source.",
  "Products listed by someone who does not own them.",
  "Private or personal information about anyone.",
] as const;

export default function GuidelinesPage() {
  return (
    <>
      <PageHeader
        title="Content guidelines"
        description="Roast the product. Help the builder. The difference between those two and a pile-on is the whole point of this site."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Guidelines" }]}
      />

      <Container width="prose" className="flex flex-col gap-10 py-12 sm:py-16">
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">
            What belongs here
          </h2>
          <ul className="ml-5 flex list-disc flex-col gap-2 text-sm text-muted-foreground marker:text-border">
            {ALLOWED.map((item) => (
              <li key={item} className="text-pretty">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">
            What does not
          </h2>
          <ul className="ml-5 flex list-disc flex-col gap-2 text-sm text-muted-foreground marker:text-border">
            {NOT_ALLOWED.map((item) => (
              <li key={item} className="text-pretty">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">
            Sourcing claims
          </h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Every factual assertion on a public page carries its source: a
            creator claim, a community opinion, or a verified signal. A
            community opinion is never presented as an established fact.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Reporting</h2>
          <p className="max-w-prose text-muted-foreground text-pretty">
            Every listing and every comment carries a report control. Reporting
            needs an account, so that a moderator can follow a report up and so
            that several people reporting the same thing can be told apart from
            one person reporting it repeatedly.
          </p>
          <p className="max-w-prose text-muted-foreground text-pretty">
            A report is a request for a person to look, not an automatic
            takedown. Nothing is hidden or removed by reporting alone, and
            reporting is not a way to make criticism of a product disappear —
            a listing is not removed for being unflattering.
          </p>
          <p className="max-w-prose text-muted-foreground text-pretty">
            You will not be told what was decided. A moderator records a reason
            for every action they take, and that record is what an appeal is
            argued against.
          </p>
        </section>

        <Alert>
          <AlertTitle>Appeals are not built yet</AlertTitle>
          <AlertDescription>
            Reporting works today. The appeals process does not have a form
            yet — if something here affects you or your product, use the
            takedown contact below and a person will read it. That is the whole
            route for now, and this page will say so until there is a better
            one.
          </AlertDescription>
        </Alert>

        <Button asChild variant="outline" size="lg" className="h-11 self-start">
          <Link href="/takedown">Report or delist a product</Link>
        </Button>
      </Container>
    </>
  );
}
