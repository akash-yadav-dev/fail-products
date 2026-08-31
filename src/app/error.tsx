// src/app/error.tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Container } from "@/components/shared/container";

/**
 * Root error boundary, for every segment.
 *
 * docs/ENGINEERING.md §11: a failure renders a safe message, never a stack
 * trace. Nothing from `error` is rendered except `digest` — the opaque
 * identifier Next.js substitutes for the real message on the server, which is
 * what makes a report actionable without leaking internals to a visitor.
 *
 * `error.message` and `error.stack` must never appear in this file.
 *
 * It deliberately renders no header or footer. Those are the parts of the page
 * most likely to be implicated in the failure, and a broken chrome around an
 * error message is worse than none.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server log is the place for detail. The page is not.
    console.error("Unhandled application error", error.digest ?? "(no digest)");
  }, [error]);

  return (
    <main id="main-content" className="flex min-h-svh flex-1 flex-col">
      <Container className="flex flex-1 items-center py-20 sm:py-28">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlert />
            </EmptyMedia>
            <EmptyTitle asChild>
              {/* The page's only heading, so it is the h1. */}
              <h1 className="text-lg">Something went wrong on our side</h1>
            </EmptyTitle>
            <EmptyDescription>
              This one is on us, not on you. Try again — if it keeps happening,
              the reference below helps us find it.
            </EmptyDescription>
          </EmptyHeader>

          {error.digest ? (
            <p className="font-mono text-xs text-muted-foreground">
              Reference: {error.digest}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="h-11" onClick={reset}>
              Try again
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11">
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </Empty>
      </Container>
    </main>
  );
}
