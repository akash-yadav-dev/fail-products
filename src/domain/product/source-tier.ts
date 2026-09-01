// src/domain/product/source-tier.ts
/**
 * Where a statement on a public page came from.
 *
 * `docs/LEGAL.md` §3 is unambiguous: *every* factual assertion on a public page
 * carries its source tier, and "a page that renders a community opinion in the
 * visual position of a verified fact is a defect". `docs/MODERATION.md` §8 says
 * the same thing from the moderation side.
 *
 * This is not a styling concern that happens to live in the domain. The site
 * publishes adversarial content about named real businesses, so the difference
 * between "the founder says this product had no users" and "this product had no
 * users" is the difference between a quote and a claim the project is making
 * itself. Modelling the tier here means a page cannot render an assertion
 * without having named its source, because there is no way to pass the text
 * without also passing the tier.
 *
 * Domain code imports nothing from Next.js, React, or any provider.
 */

export const SOURCE_TIERS = [
  {
    value: "CREATOR_CLAIM",
    /** `docs/MODERATION.md` §8 wording, kept verbatim so the UI cannot soften it. */
    label: "Claimed by creator",
    short: "Creator claim",
    description:
      "Stated by the person who built the product. Not independently checked.",
  },
  {
    value: "COMMUNITY_OPINION",
    label: "Community opinion",
    short: "Community opinion",
    description:
      "One reader's view. Not a diagnosis, and not a statement by FailProducts.",
  },
  {
    value: "VERIFIED_SIGNAL",
    label: "Verified by FailProducts",
    short: "Verified signal",
    description: "Directly observed by this system. Never an estimate.",
  },
] as const;

export type SourceTierDefinition = (typeof SOURCE_TIERS)[number];
export type SourceTier = SourceTierDefinition["value"];

export function findSourceTier(value: SourceTier): SourceTierDefinition {
  const tier = SOURCE_TIERS.find((entry) => entry.value === value);

  if (!tier) {
    throw new Error(`Unknown source tier: ${value}`);
  }

  return tier;
}

/**
 * The tier every field a product owner types into the submit form carries.
 *
 * All of it is a creator claim, without exception. The founder's own status,
 * tagline, and narrative are their account of what happened — the project has
 * checked none of it, and presenting any of it as established fact is the exact
 * defect `LEGAL.md` §3 names.
 */
export const OWNER_SUPPLIED_TIER: SourceTier = "CREATOR_CLAIM";
