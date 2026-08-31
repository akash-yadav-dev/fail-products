// src/lib/config/site.ts
/**
 * Single source of truth for site identity and navigation.
 *
 * The header, the mobile sheet, the footer, and page metadata all read from
 * here so a route only has to be added once.
 */

export const siteConfig = {
  name: "FailProducts",
  tagline: "Roast the product. Help the builder.",
  description:
    "A directory of products that failed, stalled, or never found traction. Roast the product. Help the builder.",
  /** Set NEXT_PUBLIC_SITE_URL per environment; the fallback is local dev only. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  license: "AGPL-3.0-only",
  /** AGPL-3.0-only: the source has to be findable from the site itself. */
  repository: "https://github.com/akash-yadav-dev/fail-products",
  social: {
    x: {
      label: "X",
      handle: "@akashyadav_dev",
      url: "https://x.com/akashyadav_dev",
    },
  },
} as const;

export type NavLink = {
  href: string;
  label: string;
  /** Shown in the mobile sheet, where there is room for a second line. */
  description?: string;
};

/** Primary navigation — rendered in the header and in the mobile sheet. */
export const primaryNav: readonly NavLink[] = [
  {
    href: "/products",
    label: "Products",
    description: "Browse every listed product",
  },
  {
    href: "/categories",
    label: "Categories",
    description: "Explore by what the product was",
  },
  {
    href: "/status",
    label: "Status",
    description: "Struggling, abandoned, shut down, recovering",
  },
] as const;

export type NavGroup = {
  title: string;
  links: readonly NavLink[];
};

/** Footer navigation. Grouped so each column stays scannable. */
export const footerNav: readonly NavGroup[] = [
  {
    title: "Explore",
    links: primaryNav,
  },
  {
    title: "Project",
    links: [
      { href: "/about", label: "About" },
      { href: "/submit", label: "Submit a product" },
      { href: "/guidelines", label: "Content guidelines" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/takedown", label: "Takedown / delist" },
    ],
  },
] as const;
