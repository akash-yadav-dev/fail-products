// src/app/(site)/waitlist/confirm/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";
import { confirmWaitlistEntry } from "@/services/waitlist/server-waitlist";

/**
 * The second half of the double opt-in (ADR-029).
 *
 * **Dynamic on purpose, and that is not a violation of ADR-027.** That decision
 * governs *crawlable public list* routes, whose cache hit ratio is a
 * launch-blocking metric: a category page that reads a query string stops being
 * prerendered and costs a Neon query per crawler hit. This page is neither
 * crawlable nor a list — it is reachable only from a link in an email, it is
 * marked `noindex`, and its entire content depends on a one-time secret. There
 * is nothing here for a cache to hold.
 *
 * **A GET performs the write**, which is otherwise something to avoid. It is
 * correct here because the link is the mechanism: possession of a token
 * delivered to a mailbox is the proof of control that double opt-in is made of,
 * and there is no way to demand a POST from a mail client. A prefetching mail
 * client confirming the subscription is the same evidence a human click would
 * be — the token still reached that mailbox and nowhere else.
 *
 * The **unsubscribe** route does not take that trade, because deleting somebody
 * else's data on a prefetch is not an outcome any evidence justifies. It asks
 * for a button press.
 */

export const metadata: Metadata = {
  title: "Confirm your waitlist signup",
  // Nothing here is worth indexing, and the URL carries a secret.
  robots: { index: false, follow: false },
};

export default async function ConfirmWaitlistPage({
  searchParams,
}: PageProps<"/waitlist/confirm">) {
  const { token } = await searchParams;

  const outcome = await confirmWaitlistEntry({
    token: typeof token === "string" ? token : null,
  });

  if (outcome.kind === "unknown") {
    return (
      <>
        <PageHeader
          title="That link has already been used"
          description="A confirmation link works once, and only for the address it was sent to."
        />
        <Container className="py-10 sm:py-14">
          <p className="max-w-prose text-base text-muted-foreground text-pretty">
            If you have already confirmed, there is nothing left to do. If you
            have not, join the waitlist again from the product&rsquo;s page and a
            fresh link will be sent.
          </p>
          <div className="mt-6">
            <Button asChild className="h-11">
              <Link href="/products">Browse products</Link>
            </Button>
          </div>
        </Container>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={
          outcome.kind === "confirmed"
            ? "You are on the list"
            : "You were already on the list"
        }
        description={`${outcome.productName} will reach you at the address you confirmed.`}
      />
      <Container className="py-10 sm:py-14">
        <p className="max-w-prose text-base text-muted-foreground text-pretty">
          FailProducts passes your address to this product&rsquo;s founder and
          sends nothing else. Every email carries a link that removes your
          address, and using it erases the record rather than flagging it.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild className="h-11">
            <Link href={`/products/${outcome.productSlug}`}>
              Back to {outcome.productName}
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link href="/products">Browse products</Link>
          </Button>
        </div>
      </Container>
    </>
  );
}
