// src/app/u/[username]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PackageOpen } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Container } from "@/components/shared/container";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Profile",
  description: "A builder profile on FailProducts.",
  // No accounts exist yet, so nothing here should be indexed.
  robots: { index: false, follow: false },
};

export default async function ProfilePage({
  params,
}: PageProps<"/u/[username]">) {
  const { username } = await params;

  return (
    <>
      <PageHeader
        title={`@${username}`}
        description="Builder profile layout. Accounts are not implemented yet."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: `@${username}` }]}
        eyebrow={
          <Avatar className="size-12">
            <AvatarFallback>
              {username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        }
      />

      <Container className="py-10 sm:py-14">
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpen />
            </EmptyMedia>
            <EmptyTitle>No products on this profile</EmptyTitle>
            <EmptyDescription>
              Profiles list the products a builder has published. Nothing is
              published yet.
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild variant="outline" className="h-10">
            <Link href="/products">Browse products</Link>
          </Button>
        </Empty>
      </Container>
    </>
  );
}
