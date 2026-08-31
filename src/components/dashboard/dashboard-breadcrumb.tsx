// src/components/dashboard/dashboard-breadcrumb.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { dashboardRoutes } from "@/lib/config/dashboard";

/**
 * Where you are, derived from the URL rather than passed down by every page,
 * so a new dashboard route only has to be added to lib/config/dashboard.ts.
 */
export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const current = dashboardRoutes.find((route) => route.href === pathname);
  const isRoot = pathname === "/dashboard";

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {isRoot ? (
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>

        {isRoot ? null : (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {/* An unlisted subpath still renders a crumb, just an unnamed one. */}
              <BreadcrumbPage>{current?.label ?? "Section"}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
