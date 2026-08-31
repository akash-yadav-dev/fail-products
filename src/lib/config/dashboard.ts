// src/lib/config/dashboard.ts
/**
 * Dashboard navigation, in one place for the same reason as `primaryNav`:
 * the sidebar and the breadcrumb both read it, so a section is described once.
 *
 * Icons are named rather than imported here so this stays a plain data module
 * with no React dependency — the sidebar maps the name to a component.
 */

export type DashboardNavItem = {
  href: string;
  label: string;
  /** Key into the icon map in components/dashboard/dashboard-sidebar.tsx. */
  icon: "gauge" | "package" | "settings" | "compass" | "plus" | "scale";
  /** Reachable today, or waiting on a phase that has not shipped. */
  available: boolean;
  /** Shown in the sidebar tooltip when collapsed to icons. */
  description: string;
};

export type DashboardNavGroup = {
  title: string;
  items: readonly DashboardNavItem[];
};

export const dashboardNav: readonly DashboardNavGroup[] = [
  {
    title: "Manage",
    items: [
      {
        href: "/dashboard",
        label: "Overview",
        icon: "gauge",
        available: true,
        description: "Views, clicks, and waitlist activity",
      },
      {
        href: "/dashboard/products",
        label: "Products",
        icon: "package",
        available: true,
        description: "The products you have listed",
      },
      {
        href: "/dashboard/settings",
        label: "Settings",
        icon: "settings",
        available: true,
        description: "Your public profile",
      },
    ],
  },
  {
    title: "The directory",
    items: [
      {
        href: "/products",
        label: "Browse products",
        icon: "compass",
        available: true,
        description: "Every listed product",
      },
      {
        href: "/submit",
        label: "Submit a product",
        icon: "plus",
        available: true,
        description: "How listing works",
      },
      {
        href: "/guidelines",
        label: "Content guidelines",
        icon: "scale",
        available: true,
        description: "What belongs here, and what does not",
      },
    ],
  },
] as const;

/** Every dashboard route, flattened — the breadcrumb resolves labels from this. */
export const dashboardRoutes: readonly DashboardNavItem[] = dashboardNav
  .flatMap((group) => group.items)
  .filter((item) => item.href.startsWith("/dashboard"));
