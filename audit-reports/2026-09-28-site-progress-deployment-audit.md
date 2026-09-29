# FailProducts site progress and deployment audit

**Date:** 2026-09-28
**Scope:** Current working tree on `security/consolidate-pre-launch-hardening`, including pre-existing uncommitted product editing/publication work. Report only; no application code changed.
**Decision:** **Not ready for public deployment or launch.** Local Next.js checks pass, but the Workers deployment path and several launch gates have no proof.

## Executive assessment

| Area | Assessment | Evidence |
| --- | --- | --- |
| Application implementation | **About 70% of the documented MVP**, a judgment estimate rather than a measured completion metric | Accounts, listings, discovery routes, comments/moderation, waitlists, referrals, and creator dashboard have source and test coverage. Media upload and several specified product fields are absent; publication editing is uncommitted. |
| Public-launch readiness | **About 30%**, a judgment estimate | The local UI works, but deployment compatibility, provider setup, genuine launch content, production operations, and backup/recovery are unverified or missing. |
| Local code health | **Good for the checked slice** | ESLint, TypeScript, 525 unit tests, production Next.js build, and production dependency audit passed. |
| Deployment decision | **BLOCKED** | No Workers/vinext configuration or production deploy workflow found; `vinext:check` named by the release checklist is absent from `package.json`. No preview or production deployment was exercised. |

These estimates weight the value of working end-to-end journeys, not lines of code or roadmap checkbox counts. A public directory with test fixtures but no useful founder stories has a large remaining product gap even when routes and tests exist.

## What was checked

- Read `AGENTS.md`, `CLAUDE.md`, architecture, code structure, engineering, product, roadmap, deployment, workflow, decisions, and the repository release checklist.
- Inspected source, package scripts, CI workflow, and current working-tree status.
- Started Next.js 16.3.3 dev server on **http://localhost:3100** and visited 11 public routes using Playwright at desktop width. All returned 200 and emitted no `pageerror` in that pass. Checked the home page at 390px; no horizontal overflow.
- Captured [desktop home](2026-09-28-home-desktop.png), [mobile home](2026-09-28-home-mobile.png), [product directory](2026-09-28-products-desktop.png), and [submit gate](2026-09-28-submit-desktop.png).
- Ran ESLint, Next type generation, `tsc --noEmit`, 31 unit test files (525 tests), `pnpm audit --prod`, and a Next production build. All passed.
- Tried to resolve `https://failproducts.com/` from this host; `curl` reported `Could not resolve host`. This is evidence about this host's resolver on this date, not a complete authoritative DNS audit.

**Coverage limits:** The browser pass was read-only and unauthenticated. It did not submit forms, exercise moderation, mail/OAuth/Turnstile, run database-writing integration or E2E tests, test R2, measure production Core Web Vitals, verify Cloudflare/Neon settings, or load test. `.env.local` exists but its database was not confirmed as an isolated development branch, so I did not run write-capable tests against it. The production build loaded `.env.local`; it does **not** prove a credential-free CI build or Workers compatibility.

## Progress by roadmap phase

| Phase | Current evidence | Remaining |
| --- | --- | --- |
| 0 — Foundation | Next/React/TypeScript, Drizzle/Neon, Tailwind/shadcn, tests, and CI are present. | R2 is only represented by object-key helpers, not a media transport. Workers deployment tooling/configuration is absent. |
| 1 — Accounts and product model | Passwordless auth, sessions, profiles, product schema, lifecycle rules, and product create flow exist. Edit/status/publication UI is present only as uncommitted work. | Finish, test, and review the current publication work. Product media upload and several required submission fields remain absent. |
| 2 — Public directory | Product, category, status, search, detail, metadata, sitemap, and pagination routes exist. | Home page has no featured/recent/trending product section required by `docs/PRODUCT.md` §5.1. Real launch content is absent from the observed local directory. |
| 3 — Community | Comments, reports, moderation service/dashboard, and tests exist. | Verify real moderator handling and adverse-content scenarios end to end. |
| 4 — Waitlists/referrals | Double opt-in waitlist, export, outbound click route, daily rollup code, and creator metrics exist. | Verify mail provider delivery and configure/run the scheduled rollup/prune job in deployment. |
| 4.5 — Seed directory | Roadmap defines outreach and a target of roughly 50–100 meaningful owner-published stories. | The observed local directory shows repeated **“Visibility fixture”** listings. Those are test content, not evidence of launch-ready stories or category coverage. |
| 5 — Launch | Legal pages and source link rendered in the local public UI. | Complete the release checklist, preview deployment, production configuration, backup/restore drill, monitoring, domain/mail checks, and final content/moderation review. |

## Prioritized pending issues

| ID | Priority | Finding and evidence | Suggested next verification or fix |
| --- | --- | --- | --- |
| D01 | **Blocker** | The documented Workers target is not deployable from this checkout yet. `package.json` has no vinext or Wrangler dependency/script; no `wrangler.jsonc` or production deploy workflow was found. `docs/DEPLOYMENT.md` §8 explicitly says there is no production workflow, while `.claude/skills/release-check/SKILL.md` invokes a nonexistent `pnpm vinext:check`. | Implement the chosen Workers adapter/configuration, test a preview deployment with real provider bindings, add its compatibility gate, and update docs/checklist to match the actual command. |
| D02 | **Blocker** | Critical production services are unverified: Neon production migrations, ZeptoMail sender and SPF/DKIM/DMARC, GitHub OAuth, Turnstile, R2, scheduled referral maintenance, monitoring, and backup/restore. The current local build proves none of these. | Complete provider setup in preview, execute the repository release checklist, record evidence for each provider flow, then test rollback and restore once. |
| D03 | **Blocker for launch** | No genuine content inventory was verified. Local `/products` shows repeated “Visibility fixture” entries. `docs/ROADMAP.md` Phase 4.5 requires useful owner-published narratives and category coverage before launch. | Separate/delete fixtures only in a confirmed test environment; recruit owner-consented stories and review their quality before public indexing. |
| P01 | **High** | Required submission/media scope is incomplete. `submit/actions.ts` passes name, tagline, description, website, category, and status only; no R2 upload route/adapter was found. The product requirements also name logo, screenshots, tags, dates, creator story fields, and optional link. | Choose the smallest launch-critical field set with the product spec, add controlled media transport, then test validation, ownership, storage, and rendering. If scope is intentionally reduced, update `docs/PRODUCT.md` in the same change. |
| P02 | **High** | Publication/edit/status work is present as uncommitted files and changes. It passed static checks in this tree, but its database-backed and E2E behavior was not checked in this audit. | Finish the current slice, run integration and `product-publication.spec.ts` against a confirmed isolated development branch, review the diff and authorization paths, then commit through the required branch/PR gate. |
| U01 | **Medium** | Home page has no actual product discovery section despite the MVP requirement for featured/recent/trending products. It directs visitors to browse, then shows static explanatory cards. | Add a useful bounded recent/featured section after genuine content exists; preserve public page caching and avoid a new service or ranking system. |
| U02 | **Medium** | Home page copy says referral tracking and the creator dashboard are absent. Source and the dashboard route show both implemented. This is visible misinformation on the main page (`src/app/(site)/(marketing)/page.tsx`). | Replace the stale skeleton notice with accurate launch messaging after provider-backed behavior is verified. |
| A01 | **Low** | `/auth/sign-in` rendered no `h1` in the browser pass. `CardTitle` in the page is not an `h1`, leaving the primary page heading absent. | Render a semantic `h1` while keeping the card styling; recheck heading order and keyboard navigation. |
| O01 | **High** | The observed fixture-heavy build generated 395 static pages, including product and Open Graph routes. This is not a measured production bottleneck, but generated-page count will grow with published listings. | Record build duration/size and static route count with real content before changing `generateStaticParams`; only optimize if a release gate or budget is exceeded. |

## Performance and code optimization plan

1. **Measure before changing caching.** The documented launch gate requires cache hit ratio on product and category pages against the Neon egress budget. Capture preview/prod cache headers, hit ratio, Neon egress, and p50/p95 response times. The dev server timings are unsuitable as production performance evidence.
2. **Profile the dynamic `/products` query with realistic data.** Search, filters, and sort make this route dynamic by design. Use the existing query-trace script and a development branch with representative row counts to inspect SQL plans and pagination latency. Add or change an index only for a measured slow predicate.
3. **Keep product detail pages cacheable.** The build reports five-minute revalidation for product/category/status detail routes. Verify invalidation after publication, editing, moderation, and status changes in the actual Workers preview adapter before relying on it for cost control.
4. **Track build growth.** The current 395 generated pages include local fixtures. Monitor build time and output as the directory is seeded; do not add a new cache or search provider in advance of a measured need.
5. **Clean stale source comments and gate commands.** The home page and parts of CI/docs still describe a skeleton/pre-implementation state. Update them when the current features are settled so release operators know what truly exists. This is a maintainability issue, not a runtime performance fix.

No production latency, bundle, Lighthouse, Core Web Vitals, cache-hit, or load measurements were obtained. Consequently, no numerical performance improvement is claimed here.

## Deployment gate snapshot

| Gate | Result | Basis |
| --- | --- | --- |
| Lint / TypeScript / unit | **PASS locally** | ESLint clean; type generation and `tsc` clean; 525 unit tests passed. |
| Next production build | **PASS locally with `.env.local`** | Next 16.3.3 generated 395 static pages. Credential-free CI shape not verified. |
| Production dependency audit | **PASS at check time** | `pnpm audit --prod`: no known vulnerabilities. This is an advisory snapshot, not proof of exploit safety. |
| Integration / full E2E | **NOT_VERIFIED** | Requires confirmed isolated development database; current browser check was read-only. |
| Workers/vinext compatibility | **BLOCKED** | Adapter, config, and `vinext:check` script absent. |
| Preview deployment | **NOT_VERIFIED** | No preview deployment tested. |
| Production URL / DNS | **NOT_VERIFIED** | Local resolver could not resolve `failproducts.com`; authoritative DNS and deployed hostname not checked. |
| Provider delivery, scheduler, cache, restore, monitoring | **NOT_VERIFIED** | No live provider or operational evidence collected. |
| Public content and moderation readiness | **BLOCKED for launch** | Only fixture listings observed locally; real owner stories and moderation operations not verified. |

## Recommended order when remediation starts

1. Finish and verify the existing uncommitted publication/editing slice on an isolated development database.
2. Decide the smallest complete product submission/media scope and close its documented gaps.
3. Build a preview Workers deployment and verify auth, mail, storage, Turnstile, caching, migrations, scheduler, and rollback there.
4. Replace test content with consented owner stories, fix stale home copy, and make the home page useful for discovery.
5. Run the full release checklist with recorded provider, performance, accessibility, backup/restore, and production-domain evidence before launch.

## Unverified

- Whether `.env.local` points to an isolated development Neon branch; its value was not printed or used for write-capable tests.
- Whether any production Cloudflare, Neon, R2, ZeptoMail, GitHub OAuth, or Turnstile resources already exist outside this repository.
- Whether the current uncommitted product editing/publication slice passes integration and full E2E tests.
- Actual DNS state outside this host's resolver, production traffic, cache hit ratio, Core Web Vitals, and user/customer value.
- Actual branch protection, secret scanning, mail DNS alignment, backup restore, moderation staffing, and legal contact responsiveness.

Each item needs direct provider, deployed preview/production, or confirmed test-environment evidence. A local build or source inspection cannot settle it.
