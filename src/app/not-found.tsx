// src/app/not-found.tsx
import Link from "next/link";
import { HeartCrack } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SkipToContent } from "@/components/layout/skip-to-content";
import { Container } from "@/components/shared/container";

/**
 * The 404 for the whole application, so it sits outside app/(site) and renders
 * that group's chrome itself. An unmatched URL is exactly the moment a visitor
 * most needs the navigation, so the header and footer stay.
 */
export default function NotFound() {
  return (
    <>
      <SkipToContent />
      <SiteHeader />
      <main id="main-content" className="flex flex-1 flex-col">
        <Container className="flex flex-1 items-center py-20 sm:py-28">
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HeartCrack />
              </EmptyMedia>
              <EmptyTitle asChild>
                {/* The page's only heading, so it is the h1. */}
                <h1 className="text-lg">
                  This page did not find traction either
                </h1>
              </EmptyTitle>
              <EmptyDescription>
                The page you asked for does not exist, or it was never
                published.
              </EmptyDescription>
            </EmptyHeader>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11">
                <Link href="/">Back to home</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11">
                <Link href="/products">Browse products</Link>
              </Button>
            </div>
          </Empty>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
