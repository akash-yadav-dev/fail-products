-- Seeds the fixed category taxonomy (ADR-026).
--
-- Categories are curated, not user-created: docs/PRODUCT.md §10 defines a
-- Category as a "normalized classification" and a ProductTag as a "flexible
-- discovery label", and docs/PRODUCT.md §9 forbids generating thousands of thin
-- parameterized pages — which is what a free-form taxonomy produces from typos
-- alone.
--
-- The rows mirror src/domain/product/category.ts exactly, ids included. That
-- module is the source of truth; this file writes it into the database, and
-- tests/integration/category-taxonomy.test.ts fails if the two ever disagree.
--
-- Recovery path (docs/ENGINEERING.md §1.8): this migration is data, not
-- structure, and reverses with
--   DELETE FROM categories WHERE slug IN (...the slugs below...);
-- Products referencing a deleted category have category_id set to NULL by the
-- existing ON DELETE SET NULL, so no listing is lost by reversing it.
--
-- ON CONFLICT on the slug rather than the id, because the slug is what the
-- public URL and the domain module agree on; re-running this is a no-op.

INSERT INTO "categories" ("id", "slug", "name", "description") VALUES
  ('01a05a43-fc00-7e97-b2d0-086f52378a92', 'ai', 'AI', 'Models, assistants, agents, and tools built on top of them.'),
  ('01a05a43-fc01-724a-a2ff-7766f2e41623', 'developer-tools', 'Developer tools', 'Things built for the people who build things.'),
  ('01a05a43-fc02-7445-9fb3-efb010658724', 'saas', 'SaaS', 'Subscription software sold to businesses or teams.'),
  ('01a05a43-fc03-7a04-8452-72c41dbca429', 'productivity', 'Productivity', 'Notes, tasks, calendars, and everything promising focus.'),
  ('01a05a43-fc04-74ca-8aa8-6dc6efc1c0a9', 'marketplace', 'Marketplace', 'Two-sided products that had to win both sides at once.'),
  ('01a05a43-fc05-7765-828f-f1ad6cc89100', 'social', 'Social', 'Networks, communities, and anything needing a critical mass.'),
  ('01a05a43-fc06-7b8e-a4d4-14a62fa3a710', 'ecommerce', 'E-commerce', 'Storefronts, brands, and the tooling around selling online.'),
  ('01a05a43-fc07-70de-b7b7-0da6c73ef901', 'fintech', 'Fintech', 'Payments, banking, lending, investing, and crypto.'),
  ('01a05a43-fc08-7313-b9dc-51c7c42232fe', 'health', 'Health', 'Fitness, wellbeing, medical, and care products.'),
  ('01a05a43-fc09-7f2d-a761-2d864edb0d4f', 'education', 'Education', 'Courses, tutoring, learning tools, and edtech.'),
  ('01a05a43-fc0a-7c77-8d27-f41648611216', 'games', 'Games', 'Games and the platforms and tools built around them.'),
  ('01a05a43-fc0b-7d2c-ae6a-d944b4b4f450', 'hardware', 'Hardware', 'Physical products, devices, and the software shipped on them.'),
  ('01a05a43-fc0c-7237-8b46-04554fed7f9f', 'other', 'Other', 'Everything that does not fit the categories above.')
ON CONFLICT ("slug") DO NOTHING;
