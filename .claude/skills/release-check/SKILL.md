---
name: release-check
description: Run the pre-deployment gate before promoting FailProducts to production. Use before any production deploy, before the first public launch, and after any dependency upgrade or migration. Covers build checks, migration safety, security, cost guardrails, SEO, accessibility, and rollback readiness.
---

# Release check

Nothing reaches production without passing this. A failed item is a blocked release, not a
note for later.

## 1. Build and correctness

Start with the deterministic gate — it is fast and it fails cheaply:

```bash
bash scripts/verify-changes.sh --range origin/main..HEAD
```

Then:

```bash
pnpm typecheck          # tsc --noEmit, strict mode
pnpm lint
pnpm test               # unit
pnpm test:integration   # against a Neon development branch
pnpm build              # Next.js production build
pnpm vinext:check       # Cloudflare/vinext compatibility check
```

`docs/DEPLOYMENT.md` §8. A warning that has been ignored for three releases is a finding —
either fix it or record why it is acceptable.

## 2. Migrations

```
[ ] every schema change has a matching migration in drizzle/migrations
[ ] the generated SQL was read, not just generated
[ ] no unreviewed DROP or RENAME inferred by drizzle-kit
[ ] destructive changes follow expand -> migrate -> contract
[ ] a down migration exists, or the recovery path is written in the PR
[ ] applied and verified on a preview deployment first
```

Never deploy application code and a schema change in an order where the old code sees the new
schema unprepared.

## 3. Security

Run the `security-reviewer` agent against the diff. Independently confirm:

```
[ ] no secrets in the diff, the repo, or the workflow files
[ ] .env.example contains names only
[ ] every new endpoint has authorization and a rate limit
[ ] every new user-content field is escaped at render
[ ] every new external URL field is protocol-validated
[ ] session cookie flags correct for the production environment
[ ] Turnstile tokens verified server-side on public forms
[ ] error responses leak no stack traces, SQL, or binding names
[ ] dependency audit clean, or exceptions documented
[ ] Next.js at or above 16.3.3 (August 2026 critical fixes)
```

## 4. Cost and abuse guardrails

Cloudflare and Neon bill on usage, and this is a solo-funded project. `docs/DEPLOYMENT.md` §11.

```
[ ] no unauthenticated endpoint triggers unbounded database work
[ ] every feed and list query is cursor-paginated with a hard cap
[ ] no per-request external API calls on public pages
[ ] no background polling added
[ ] referral_events rollup and prune are running
[ ] Workers CPU limit configured to prevent runaway usage
[ ] public pages are cacheable and are actually being cached
```

Neon's plan caps egress. Verify the cache hit ratio on product and category pages before
launch — an uncached public directory will exhaust egress well before it exhausts anything else.

## 5. Public content and SEO

```
[ ] every public route sets title, description, canonical, and Open Graph
[ ] no thin or duplicate parameterised pages are indexable (docs/PRODUCT.md §9)
[ ] product pages render meaningful content without JavaScript
[ ] robots.txt and sitemap.xml are correct for the environment
[ ] preview deployments are noindex
[ ] slug changes emit 301 redirects from the previous slug
```

That last item matters more than it looks: this product's value is accumulated search
authority on `/products/[slug]`, and a rename without a redirect discards it permanently.

## 6. Accessibility

`docs/DESIGN.md` §10, target WCAG AA.

```
[ ] keyboard reachable, with visible focus on every interactive control
[ ] form labels and error messages associated correctly
[ ] contrast meets AA
[ ] status is never conveyed by colour alone
[ ] reduced motion respected
[ ] headings form a sensible outline
```

## 7. Email

```
[ ] SPF, DKIM, and DMARC records verified for the sending domain
[ ] templates have a plain-text fallback
[ ] user content escaped in HTML bodies; no CR/LF in header values
[ ] no email failure can fail the primary transaction (docs/PRODUCT.md §14)
[ ] preview and local environments cannot send to real recipients
```

## 8. Rollback readiness

```
[ ] the previous deployment is identifiable and re-promotable
[ ] the database change is backward compatible with the previous release
[ ] a recent backup or Neon branch restore point exists and its age is known
[ ] the incident procedure in docs/DEPLOYMENT.md §12 is current
```

## 9. First public launch only

Additional gates from `docs/ROADMAP.md` Phase 5, checked once:

```
[ ] LICENSE, NOTICE.md, TRADEMARK.md, CODE_OF_CONDUCT.md, SECURITY.md present
[ ] every page links to the source repository (AGPL section 13 network source offer — NOTICE.md)
[ ] Terms and Privacy pages published and reachable from the footer
[ ] docs/LEGAL.md delist and data-subject-request paths are live, with a working contact
[ ] repository branch protection on main is enforced
[ ] secret scanning and push protection enabled
[ ] the contributor setup path in docs/CONTRIBUTING.md §10 works on a clean machine
[ ] backup and recovery procedure documented and tested once
[ ] moderation queue and report handling verified end to end
[ ] enough seeded content that the directory is useful on arrival
```

## Reporting

State each section as PASS, PASS WITH NOTES, or BLOCKED, and list the specific failing items.
Do not summarise a section as passing when an item inside it was skipped — say it was skipped.
