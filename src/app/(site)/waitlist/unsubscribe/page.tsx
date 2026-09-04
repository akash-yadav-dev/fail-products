// src/app/(site)/waitlist/unsubscribe/page.tsx
import type { Metadata } from "next";

import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import { UnsubscribeForm } from "@/components/waitlist/unsubscribe-form";
import { unsubscribeAction } from "./actions";

/**
 * Removing an address from a waitlist (`docs/LEGAL.md` §5).
 *
 * **A button, not a link that acts on load.** The confirm route accepts a GET
 * that writes, because a prefetching mail client following a confirmation link
 * still proves the token reached that mailbox. Deletion is different: a
 * prefetcher that erased somebody's subscription would be destroying data on
 * nobody's instruction, and there is no evidence that justifies it. So the page
 * renders, and a Server Action does the work.
 *
 * Nothing is read from the database to render this. The page does not say
 * whether the token matches anything, because an unsubscribe page that showed
 * "you are subscribed to X" would tell whoever opened the link something the
 * subscriber never agreed to publish.
 */

export const metadata: Metadata = {
  title: "Remove your email",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: PageProps<"/waitlist/unsubscribe">) {
  const { token } = await searchParams;

  return (
    <>
      <PageHeader
        title="Remove your email"
        description="One press and the record is deleted. Nothing is kept, and nothing is flagged."
      />
      <Container className="py-10 sm:py-14">
        <div className="max-w-prose">
          <p className="text-base text-muted-foreground text-pretty">
            This removes the address the link was sent to from the waitlist it
            was added to. If somebody else entered your address, this is the way
            to undo it — and nothing was ever sent to it, because an unconfirmed
            signup receives no email but this one.
          </p>

          <div className="mt-6">
            <UnsubscribeForm
              token={typeof token === "string" ? token : ""}
              action={unsubscribeAction}
            />
          </div>
        </div>
      </Container>
    </>
  );
}
