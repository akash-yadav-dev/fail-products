// src/components/dashboard/dashboard-header.tsx
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardBreadcrumb } from "@/components/dashboard/dashboard-breadcrumb";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * The dashboard's own top bar. It replaces the marketing header rather than
 * sitting under it — app/(site)/layout.tsx owns that one, and the dashboard is
 * outside that group.
 */
export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-1 data-[orientation=vertical]:h-4"
      />
      <DashboardBreadcrumb />

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href="/">
            View site
            <ArrowUpRight />
          </Link>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
