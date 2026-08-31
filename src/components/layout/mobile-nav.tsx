// src/components/layout/mobile-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SiteLogo } from "@/components/layout/site-logo";
import { primaryNav, siteConfig } from "@/lib/config/site";
import { isActivePath } from "@/lib/urls/is-active-path";
import { cn } from "@/lib/utils";

/**
 * Hamburger navigation for viewports below md.
 *
 * Every link is wrapped in SheetClose so the panel dismisses on navigation
 * without needing to track open state.
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Open menu"
          className="size-10 md:hidden"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-[min(20rem,88vw)] gap-0 p-0 sm:max-w-sm"
      >
        <SheetHeader className="border-b border-border/60 p-4 text-left">
          <SheetTitle className="flex items-center">
            <SiteLogo size="sm" />
          </SheetTitle>
          <SheetDescription className="sr-only">
            {siteConfig.tagline}
          </SheetDescription>
        </SheetHeader>

        <nav aria-label="Mobile" className="flex flex-col gap-1 overflow-y-auto p-3">
          {primaryNav.map((link) => {
            const active = isActivePath(pathname, link.href);

            return (
              <SheetClose asChild key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 flex-col justify-center rounded-lg px-3 py-2 outline-none transition-colors",
                    "focus-visible:ring-3 focus-visible:ring-ring/50",
                    active ? "bg-muted" : "hover:bg-muted/60"
                  )}
                >
                  <span
                    className={cn(
                      "text-sm font-medium",
                      active ? "text-foreground" : "text-foreground/90"
                    )}
                  >
                    {link.label}
                  </span>
                  {link.description ? (
                    <span className="text-xs text-muted-foreground">
                      {link.description}
                    </span>
                  ) : null}
                </Link>
              </SheetClose>
            );
          })}
        </nav>

        <Separator />

        <SheetFooter className="gap-2 p-4">
          <SheetClose asChild>
            <Button asChild size="lg" className="h-11 w-full">
              <Link href="/submit">Submit a product</Link>
            </Button>
          </SheetClose>
          <SheetClose asChild>
            <Button asChild variant="outline" size="lg" className="h-11 w-full">
              <Link href="/auth/sign-in">Sign in</Link>
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
