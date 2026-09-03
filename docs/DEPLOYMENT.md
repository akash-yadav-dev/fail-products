# FailProducts — Deployment and Infrastructure

## 1. Target deployment

FailProducts uses:

- Next.js App Router;
- Cloudflare Workers;
- Neon PostgreSQL;
- Cloudflare R2;
- ZeptoMail;
- Cloudflare Turnstile.

Cloudflare’s current documentation recommends **vinext** as the default path for new Next.js applications on Workers. The documented workflow supports creating or migrating a Next.js app, checking compatibility, developing with vinext, and deploying with `@vinext/cloudflare`. vinext is currently beta, so upgrades must be compatibility-tested before production rollout.

## 2. Environment model

Use three logical environments:

- local;
- preview;
- production.

Do not create extra infrastructure environments until needed.

### Environment variables

`.env.example` lists names only. Local and preview values are supplied through the
environment, and production secrets are stored with the provider. The application
uses `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, GitHub OAuth credentials,
ZeptoMail credentials, R2 credentials, and Turnstile credentials. `E2E_FAULT_ROUTES` and
`E2E_AUTH_BYPASS` are deliberately not deployment variables; they are injected only by the local
Playwright server to exercise error and authenticated dashboard flows. Never set either in preview
or production.

### Local

- local `.env.local`;
- development Neon branch/project;
- local test/mock email adapter;
- local R2 emulator or dev bucket where practical.

### Preview

- isolated deployment;
- non-production database branch;
- no production email recipients by default;
- safe sample content.

### Production

- production domain;
- production Neon database;
- production R2 bucket;
- production ZeptoMail sender;
- Turnstile production widget.

## 3. Cloudflare setup

Recommended initial resources:

- Workers application;
- custom domain `failproducts.com`;
- R2 bucket for media;
- Turnstile site key/secret;
- optional Cron Trigger only when background work is needed.

**Production runs on the Workers Paid plan (ADR-016).** The Free plan is for local experiments
only.

| | Free | Paid |
|---|---|---|
| Requests | 100,000/day | no daily limit |
| CPU time per invocation | **10 ms** | 30 s default, up to 5 min |
| Memory | 128 MB | 128 MB |
| Subrequests | 50/request | 10,000/request |

Verified against Cloudflare's limits documentation on 2026-08-31.

The 10 ms CPU ceiling is the decisive number. Server-rendering a product page with database
reads exceeds it routinely, and the request is terminated rather than merely slowed. Designing
around that budget would distort every rendering decision in the project to save $5/month.

Configure an explicit CPU limit on the Paid plan anyway. On Free a runaway loop returns an
error; on Paid it returns a bill.

## 4. Neon setup

Use one production project and one development project initially, or one project with a dedicated development branch where the workflow permits it.

Current Neon Free plan includes:

- 10 projects;
- 50 CU-hours/month per project;
- 0.5 GB storage/project;
- 10 branches/project;
- 5 GB egress/month;
- scale-to-zero behavior.

Use the Neon HTTP driver for ordinary serverless request queries.

## 5. R2 setup

Use a bucket such as:

`failproducts-media`

Object prefixes:

```text
products/{productId}/logo/{file}
products/{productId}/screenshots/{file}
users/{userId}/avatar/{file}
```

Current R2 Free tier includes:

- 10 GB-month storage;
- 1 million Class A operations/month;
- 10 million Class B operations/month;
- free egress.

## 6. ZeptoMail setup

Use dedicated transactional sending.

### Domain authentication — required before launch

Authentication is passwordless (ADR-014), so **email delivery is on the critical path for
login**. A message that lands in spam is a user who cannot sign in. Before production:

| Record | Purpose |
|---|---|
| SPF | authorise ZeptoMail to send for `failproducts.com` |
| DKIM | sign outbound mail; publish the ZeptoMail-provided key |
| DMARC | start at `p=none` with reporting, tighten to `quarantine` once reports are clean |

Verify the domain in ZeptoMail and confirm alignment before the first real send. GitHub OAuth
is the fallback sign-in path during a mail outage.

### Initial templates

- sign-in code / magic link;
- waitlist confirmation;
- comment received;
- moderation action;
- product status update.

ZeptoMail currently uses a pay-as-you-go credit model. One credit covers 10,000 emails and is valid for six months. Keep email volume low until usage justifies more automation.

## 7. Turnstile

Use one or a small number of widgets rather than a widget per form.

Current Turnstile Free plan supports up to 20 widgets and unlimited challenges.

Use it on:

- registration if abuse appears;
- unauthenticated waitlist;
- product reports;
- public comment endpoints if guest comments are ever enabled.

Authenticated product creation may rely on rate limits without Turnstile initially.

## 8. Build/deploy checks

The repository currently has no production deployment workflow. CI verifies the application and
does not deploy Workers. GitHub's dependency-review action is enabled only when the repository
Dependency graph is enabled and the `DEPENDENCY_REVIEW_ENABLED` repository variable is set to
`true`; until then CI reports an explicit skip and runs `pnpm audit` for production dependencies.

Every production deploy should pass:

```text
TypeScript check
Lint
Unit tests
Integration tests (where configured)
Next.js build
vinext compatibility/build check
Migration validation
```

Do not deploy a schema change without the matching migration.

## 9. Rollback

Rollback strategy:

1. revert application deployment;
2. do not automatically roll back database migrations unless a tested down migration exists;
3. preserve data during incident response;
4. document manual recovery.

For destructive schema changes, use expand → migrate → contract rather than immediate destructive replacement.

## 10. Cache strategy

Public product pages are read-heavy.

Use:

- server rendering;
- HTTP/CDN caching;
- framework cache/invalidation;
- R2 CDN delivery.

Do not cache personalized dashboard responses.

## 11. Cost guardrails

The MVP baseline is roughly $5/month (Workers Paid, ADR-016) with everything else inside free
allowances. Because Workers Paid bills on usage, these rules protect a bill rather than a quota
— they matter more than they did on Free, not less.

Cost-control rules:

- no unnecessary background polling;
- no per-page external API calls;
- no unbounded search queries;
- no high-frequency GitHub synchronization;
- no storing full analytics event streams unless required;
- compress/resize images;
- paginate every feed;
- prune and roll up `referral_events` on schedule (ADR-018).

### Caching is a budget, not an optimisation

Neon's Free plan allows **5 GB egress per month**, and FailProducts is a read-heavy public
directory whose whole purpose is search traffic. An uncached product page hits the database on
every request, and the egress allowance will be exhausted long before storage or compute.

Treat the cache hit ratio on `/products/[slug]` and `/categories/[slug]` as a launch-blocking
metric, and verify it in the release check.

A route that awaits `searchParams` is dynamically rendered and cannot be cached at all, so a
public list is cacheable or it is parameterized — never both. ADR-027 settles which surfaces
get which: `/products/[slug]`, `/categories/[slug]`, and `/status/[slug]` are prerendered with
`revalidate = 300`; `/products` carries every parameter and stays dynamic.

## 12. Incident response

For any production issue:

1. stop the source of the problem;
2. verify whether data is safe;
3. check Cloudflare logs;
4. check DB health;
5. rollback app if appropriate;
6. communicate impact;
7. document root cause;
8. create a preventive test or guardrail.

## 13. Upgrade policy

Keep Next.js and Cloudflare tooling reasonably current, especially for security releases.

Next.js published a critical security update on August 25, 2026 and lists Next.js 16.3.3 as Active LTS. Production dependencies should not remain on vulnerable versions.

Before upgrading Next.js/vinext:

```text
review release notes
→ run compatibility checks
→ run test suite
→ deploy preview
→ verify public pages + auth + mutations
→ production
```
