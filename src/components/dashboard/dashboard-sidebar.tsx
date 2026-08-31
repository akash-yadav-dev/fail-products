// src/components/dashboard/dashboard-sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDown,
  Compass,
  Gauge,
  LogIn,
  Package,
  Plus,
  Scale,
  Settings,
  type LucideIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { SiteLogo } from "@/components/layout/site-logo";
import {
  dashboardNav,
  type DashboardNavItem,
} from "@/lib/config/dashboard";
import { isActivePath } from "@/lib/urls/is-active-path";

const ICONS: Record<DashboardNavItem["icon"], LucideIcon> = {
  gauge: Gauge,
  package: Package,
  settings: Settings,
  compass: Compass,
  plus: Plus,
  scale: Scale,
};

/**
 * "/dashboard" is the parent of every other dashboard route, so prefix matching
 * would mark it active on all of them. It matches exactly; the rest match their
 * subtree, which is what keeps a future /dashboard/products/[id] highlighted.
 */
function isCurrent(pathname: string, href: string): boolean {
  return href === "/dashboard"
    ? pathname === href
    : isActivePath(pathname, href);
}

export function DashboardSidebar({ signOutAction }: { signOutAction: () => Promise<void> }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  /** On mobile the sidebar is a sheet over the content; navigating must close it. */
  const closeOnMobile = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              tooltip={`${"FailProducts"} home`}
            >
              <Link href="/" onClick={closeOnMobile}>
                <SiteLogo
                  size="sm"
                  withWordmark={false}
                  className="shrink-0 group-data-[collapsible=icon]:-ml-0.5"
                />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm font-semibold">
                    FailProducts
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Creator dashboard
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {dashboardNav.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  const current = isCurrent(pathname, item.href);

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={current}
                        tooltip={item.label}
                      >
                        <Link
                          href={item.href}
                          onClick={closeOnMobile}
                          aria-current={current ? "page" : undefined}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip="Account">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                  >
                    <LogIn className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-medium">
                      Signed in
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      Passwordless account
                    </span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 opacity-60" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="top"
                className="w-56"
                sideOffset={8}
              >
                <DropdownMenuLabel className="font-normal text-muted-foreground">
                  Your account is signed in with a passwordless session.
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <form action={signOutAction}>
                    <button type="submit" className="w-full text-left">Sign out</button>
                  </form>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/" onClick={closeOnMobile}>
                    Back to the site
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
