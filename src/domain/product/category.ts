// src/domain/product/category.ts
/**
 * The category taxonomy.
 *
 * **Fixed and curated, not free-form** (ADR-026). `docs/PRODUCT.md` §10 already
 * drew the line this implements: a Category is a "normalized classification"
 * while a ProductTag is a "flexible discovery label". Categories are the
 * indexable, navigable axis; tags are where open-ended vocabulary belongs.
 *
 * The list lives here rather than only in the seed migration so it has one
 * source of truth. The migration writes exactly these rows, and an integration
 * test asserts the database still matches — a curated list that silently drifts
 * from its seed is worse than no list, because the pages that read it start
 * 404ing for reasons nothing explains.
 *
 * The ids are literal and deterministic. Every environment then holds the same
 * category id for the same category, so a database dump, a fixture, and a
 * migration on a fresh branch all agree — and re-running the seed is a no-op
 * rather than a second set of duplicates under different keys. They are
 * genuine UUIDv7 values (ADR-021).
 *
 * **Slugs are frozen once published.** A slug is a URL, and a category has no
 * redirect history — products got `product_slug_history` in ADR-019 precisely
 * because a rename discards every inbound link invisibly, and nothing here
 * gives categories the same protection. Renaming `developer-tools` would 404
 * every link to `/categories/developer-tools`. Adding a category is additive
 * and fine; changing or removing an existing slug is not, and
 * `tests/unit/domain/product/category.test.ts` fails if it happens.
 *
 * The `name` and `description` are display text and may change freely.
 *
 * **The list mixes three axes** — domains (AI, Fintech, Health, Education,
 * Games, Hardware, E-commerce), audiences (Developer tools, Productivity,
 * Social), and business models (SaaS, Marketplace) — and a product picks at
 * most one, so more than one can fit. The tie-break, stated in the submit form
 * and `docs/PRODUCT.md` §10: pick the domain the product served, and use SaaS
 * or Marketplace only when no domain category fits. It is a convention rather
 * than a constraint, because no server-side signal separates an honest
 * judgement call from a wrong one.
 *
 * Domain code imports nothing from Next.js, React, Drizzle, or any provider.
 */

export const PRODUCT_CATEGORIES = [
  {
    id: "01a05a43-fc00-7e97-b2d0-086f52378a92",
    slug: "ai",
    name: "AI",
    description: "Models, assistants, agents, and tools built on top of them.",
  },
  {
    id: "01a05a43-fc01-724a-a2ff-7766f2e41623",
    slug: "developer-tools",
    name: "Developer tools",
    description: "Things built for the people who build things.",
  },
  {
    id: "01a05a43-fc02-7445-9fb3-efb010658724",
    slug: "saas",
    name: "SaaS",
    description: "Subscription software sold to businesses or teams.",
  },
  {
    id: "01a05a43-fc03-7a04-8452-72c41dbca429",
    slug: "productivity",
    name: "Productivity",
    description: "Notes, tasks, calendars, and everything promising focus.",
  },
  {
    id: "01a05a43-fc04-74ca-8aa8-6dc6efc1c0a9",
    slug: "marketplace",
    name: "Marketplace",
    description: "Two-sided products that had to win both sides at once.",
  },
  {
    id: "01a05a43-fc05-7765-828f-f1ad6cc89100",
    slug: "social",
    name: "Social",
    description: "Networks, communities, and anything needing a critical mass.",
  },
  {
    id: "01a05a43-fc06-7b8e-a4d4-14a62fa3a710",
    slug: "ecommerce",
    name: "E-commerce",
    description: "Storefronts, brands, and the tooling around selling online.",
  },
  {
    id: "01a05a43-fc07-70de-b7b7-0da6c73ef901",
    slug: "fintech",
    name: "Fintech",
    description: "Payments, banking, lending, investing, and crypto.",
  },
  {
    id: "01a05a43-fc08-7313-b9dc-51c7c42232fe",
    slug: "health",
    name: "Health",
    description: "Fitness, wellbeing, medical, and care products.",
  },
  {
    id: "01a05a43-fc09-7f2d-a761-2d864edb0d4f",
    slug: "education",
    name: "Education",
    description: "Courses, tutoring, learning tools, and edtech.",
  },
  {
    id: "01a05a43-fc0a-7c77-8d27-f41648611216",
    slug: "games",
    name: "Games",
    description: "Games and the platforms and tools built around them.",
  },
  {
    id: "01a05a43-fc0b-7d2c-ae6a-d944b4b4f450",
    slug: "hardware",
    name: "Hardware",
    description: "Physical products, devices, and the software shipped on them.",
  },
  {
    // A junk drawer is a real cost, and it is still the cheaper one. Without it
    // a founder has to file their product under something it is not, and a
    // taxonomy full of deliberate mislabels is less useful than one with an
    // honest overflow bucket.
    id: "01a05a43-fc0c-7237-8b46-04554fed7f9f",
    slug: "other",
    name: "Other",
    description: "Everything that does not fit the categories above.",
  },
] as const;

export type ProductCategoryDefinition = (typeof PRODUCT_CATEGORIES)[number];
export type ProductCategorySlug = ProductCategoryDefinition["slug"];

/** The category for a public URL segment, or undefined. Drives the 404. */
export function findCategoryBySlug(
  slug: string
): ProductCategoryDefinition | undefined {
  return PRODUCT_CATEGORIES.find((category) => category.slug === slug);
}

/**
 * Whether a submitted category slug is one a product may be filed under.
 *
 * The submit form sends a slug from a `<select>`, and a `<select>` is a
 * suggestion, not a constraint — the request is a form post like any other.
 * `docs/SECURITY.md` §4 lists category IDs among the things to validate, and
 * this is where that happens.
 */
export function isProductCategorySlug(
  input: unknown
): input is ProductCategorySlug {
  return (
    typeof input === "string" &&
    PRODUCT_CATEGORIES.some((category) => category.slug === input)
  );
}
