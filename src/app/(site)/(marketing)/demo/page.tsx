import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/products/status-badge";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import type { FailureStatus } from "@/domain/product/failure-status";

export const metadata: Metadata = {
  title: "Fictional SaaS previews",
  description: "Development-only sample content for reviewing FailProducts layouts.",
  robots: { index: false, follow: false },
};

// These are fictional layout samples, never database seeds or public claims.
// Available only in local development and the isolated staging preview.
const EXAMPLES: readonly {
  slug: string;
  name: string;
  status: FailureStatus;
  pitch: string;
  audience: string;
  story: string;
  lesson: string;
}[] = [
  {
    slug: "signaldesk",
    name: "SignalDesk Demo",
    status: "LOW_TRACTION",
    pitch: "A shared feedback inbox for small SaaS teams.",
    audience: "Small software teams sorting requests from email and chat.",
    story:
      "Fictional example: the team built a polished inbox before learning whether customers wanted another place to triage feedback. A few trial accounts signed up, but none made it part of a weekly routine.",
    lesson:
      "Ask teams to show their current feedback workflow and pay for a manual pilot before building a full inbox.",
  },
  {
    slug: "renewalpilot",
    name: "RenewalPilot Demo",
    status: "ABANDONED",
    pitch: "Renewal reminders for tiny subscription businesses.",
    audience: "Founders managing a handful of annual customer contracts.",
    story:
      "Fictional example: the idea stalled at a prototype. The target users already tracked renewals in their billing software, so a separate reminder dashboard gave them another task without saving enough time.",
    lesson:
      "Validate the cost of missed renewals before making a standalone product; an export or integration may be more useful than a new dashboard.",
  },
  {
    slug: "briefboard",
    name: "BriefBoard Demo",
    status: "STRUGGLING",
    pitch: "A client approval board for small design agencies.",
    audience: "Agencies collecting feedback on drafts and deliverables.",
    story:
      "Fictional example: early testers liked the board, but clients kept replying by email. The workflow depended on people outside the paying team changing habits, and the prototype did not make that switch worthwhile.",
    lesson:
      "Test the client invitation and approval flow first. If clients stay in email, make the agency's email workflow better instead.",
  },
];

export default function DemoPage() {
  if (process.env.NODE_ENV !== "development" && process.env.PREVIEW_ONLY !== "1") notFound();

  return (
    <>
      <PageHeader
        title="Fictional SaaS previews"
        description="Three local-only examples for reviewing the content layout. These are invented products, not founder submissions or real businesses."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Demo" }]}
      />

      <Container className="flex flex-col gap-10 py-10 sm:py-14">
        <p className="max-w-3xl rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Development preview only. Nothing here is stored in the database,
          appears in search, or may be published as a real listing. Replace
          these stories with owner-approved accounts before launch.
        </p>

        <nav aria-label="Demo products">
          <ul className="grid gap-4 md:grid-cols-3">
            {EXAMPLES.map((example) => (
              <li key={example.slug}>
                <a
                  href={`#${example.slug}`}
                  className="flex h-full flex-col gap-3 rounded-xl border p-5 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{example.name}</span>
                    <StatusBadge status={example.status} />
                  </div>
                  <span className="text-sm text-muted-foreground">{example.pitch}</span>
                  <span className="mt-auto text-sm font-medium">Read the sample story →</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {EXAMPLES.map((example) => (
          <article
            key={example.slug}
            id={example.slug}
            className="scroll-mt-8 border-t pt-8"
          >
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">{example.name}</h2>
              <StatusBadge status={example.status} />
            </div>
            <p className="mt-2 text-muted-foreground">{example.pitch}</p>
            <dl className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <dt className="font-medium">Who it was for</dt>
                <dd className="mt-2 text-sm text-muted-foreground">{example.audience}</dd>
              </div>
              <div>
                <dt className="font-medium">What went wrong</dt>
                <dd className="mt-2 text-sm text-muted-foreground">{example.story}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="font-medium">What the builder might do differently</dt>
                <dd className="mt-2 text-sm text-muted-foreground">{example.lesson}</dd>
              </div>
            </dl>
          </article>
        ))}
      </Container>
    </>
  );
}
