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
  icon: "gauge" | "package" | "settings" | "compass" | "plus" | "scale" | "shield";
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

/**
 * The moderation group, shown only to an account holding the role.
 *
 * Kept out of `dashboardNav` rather than filtered out of it, because a nav item
 * whose visibility depends on a role is a different kind of thing from one that
 * is simply always there — and merging them would put the decision in a
 * `.filter()` somewhere, which is where it gets forgotten.
 *
 * Hiding the link is not the control. `/dashboard/moderation` 404s for anybody
 * without the role, and every action re-checks it server-side
 * (`docs/SECURITY.md` §3).
 */
export const moderationNav: DashboardNavGroup = {
  title: "Moderation",
  items: [
    {
      href: "/dashboard/moderation",
      label: "Report queue",
      icon: "shield",
      available: true,
      description: "Reports waiting on a decision",
    },
  ],
} as const;

/** Every dashboard route, flattened — the breadcrumb resolves labels from this. */
export const dashboardRoutes: readonly DashboardNavItem[] = [
  ...dashboardNav,
  moderationNav,
]
  .flatMap((group) => group.items)
  .filter((item) => item.href.startsWith("/dashboard"));
