// src/app/u/[username]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { externalUrlHost, safeExternalHref } from "@/lib/validation/url";
import { getPublicProfile } from "@/services/user/server-profile";

/**
 * A builder's public profile.
 *
 * The lookup is case-insensitive because `users.username_lower` is what carries
 * the unique index — `/u/Akash` and `/u/akash` are the same person, and one of
 * them 404ing would be a broken link for no reason.
 */

export async function generateMetadata({
  params,
}: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  const profile = await getPublicProfile(username);

  if (!profile) {
    // An unknown handle is not a page. Saying so in the metadata keeps a 404
    // from being indexed on the strength of its title alone.
    return { title: "Profile not found", robots: { index: false, follow: false } };
  }

  const name = profile.displayName ?? `@${profile.username}`;

  return {
    title: name,
    description: profile.bio ?? `${name} on FailProducts.`,
    alternates: { canonical: `/u/${profile.username}` },
  };
}

export default async function ProfilePage({
  params,
}: PageProps<"/u/[username]">) {
  const { username } = await params;
  const profile = await getPublicProfile(username);

  // The page used to resolve for any value at all. An unknown handle is a 404.
  if (!profile) notFound();

  const handle = profile.username ?? username;
  // Validated again at render, not only at write (AGENTS.md §7): rows predate
  // rules, and a column trusted because it was checked on the way in is the
  // shape of every stored XSS.
  const website = safeExternalHref(profile.websiteUrl);
  const websiteLabel = externalUrlHost(profile.websiteUrl);

  return (
    <>
      <PageHeader
        title={profile.displayName ?? `@${handle}`}
        description={profile.bio ?? `@${handle} on FailProducts.`}
        breadcrumbs={[{ label: "Home", href: "/" }, { label: `@${handle}` }]}
        eyebrow={
          <Avatar className="size-12">
            <AvatarFallback>{handle.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        }
      />

      <Container className="py-10 sm:py-14">
        {website ? (
          <p className="mb-8 text-sm">
            <a
              href={website}
              className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
              rel="me nofollow noopener noreferrer"
            >
              {websiteLabel}
            </a>
          </p>
        ) : null}

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
