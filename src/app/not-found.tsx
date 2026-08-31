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
import { Container } from "@/components/shared/container";

export default function NotFound() {
  return (
    <Container className="flex flex-1 items-center py-20 sm:py-28">
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HeartCrack />
          </EmptyMedia>
          <EmptyTitle>This page did not find traction either</EmptyTitle>
          <EmptyDescription>
            The page you asked for does not exist, or it was never published.
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
  );
}
