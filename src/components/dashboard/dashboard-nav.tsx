// src/components/dashboard/dashboard-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath } from "@/lib/urls/is-active-path";
import { cn } from "@/lib/utils";

const DASHBOARD_NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/products", label: "Products" },
  { href: "/dashboard/settings", label: "Settings" },
] as const;

/**
 * Route-based tabs. Real links rather than a Tabs widget, so each section is
 * addressable, shareable, and works without JavaScript.
 */
export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-px"
    >
      {DASHBOARD_NAV.map((link) => {
        const active =
          link.href === "/dashboard"
            ? pathname === link.href
            : isActivePath(pathname, link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap outline-none transition-colors",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
