// src/components/layout/site-header.tsx
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { MainNav } from "@/components/layout/main-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SiteLogo } from "@/components/layout/site-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Container } from "@/components/shared/container";
import { siteConfig } from "@/lib/config/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Container className="flex h-16 items-center justify-between gap-2 sm:h-18 sm:gap-4">
        <Link
          href="/"
          aria-label={`${siteConfig.name} home`}
          className="flex shrink-0 items-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <SiteLogo size="md" priority />
        </Link>

        <MainNav />

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button
            asChild
            variant="ghost"
            size="lg"
            className="hidden md:inline-flex"
          >
            <Link href="/auth/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="lg" className="hidden md:inline-flex">
            <Link href="/submit">Submit a product</Link>
          </Button>

          <ThemeToggle />
          <MobileNav />
        </div>
      </Container>
    </header>
  );
}
