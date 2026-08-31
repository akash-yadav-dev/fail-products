# FailProducts — Technical Architecture

## 1. Architecture goal

The architecture should be:

- cheap to run at launch;
- easy for one maintainer to operate;
- easy for contributors to understand;
- portable enough to migrate providers;
- optimized for SEO and public read-heavy traffic;
- safe for user-generated content;
- able to scale without premature infrastructure.

## 2. Architecture decision

### Application

- Next.js App Router
- TypeScript
- React Server Components by default
- Route Handlers for HTTP APIs
- Server Actions only for simple server mutations where they improve clarity
- `proxy.ts` only when request interception is genuinely required

Next.js 16 is the baseline major version. Cloudflare currently recommends vinext as the default path for new Next.js applications on Workers. Cloudflare documents support for App Router, React Server Components, Server Actions, SSR, static generation, ISR, route handlers and more, while noting that vinext is beta. Therefore, Cloudflare compatibility must be checked before major dependency upgrades. See [Deployment](./DEPLOYMENT.md).

### Hosting

- Cloudflare Workers (**Paid plan**, ADR-016)
- Custom domain through Cloudflare
- Cloudflare CDN/cache for public assets and cacheable responses

The Workers **Free** plan caps CPU at **10 ms per request** (verified 2026-08-31), which
server-rendering a React Server Component page with database reads will exceed routinely — the
failure mode is a terminated request, not a slow one. Free also caps subrequests at 50 per
request and requests at 100,000/day.

Paid starts at $5/month, raises the CPU limit to 30 seconds by default, and removes the daily
request cap. Configure an explicit CPU limit anyway: on Paid, a runaway loop costs money rather
than returning an error.

### Database

- Neon PostgreSQL
- Drizzle ORM
- `@neondatabase/serverless` using the Neon HTTP driver for ordinary request/response queries

Neon’s Free plan currently provides 10 projects, 50 CU-hours/month per project, 0.5 GB storage/project, 10 branches/project, and 5 GB egress/month. Neon is serverless and scale-to-zero oriented, making it suitable for the MVP.

Drizzle has native Neon HTTP/WebSocket support. Use HTTP for typical short queries and WebSockets only where interactive transaction behavior actually requires it.

### Object storage

- Cloudflare R2

Use R2 for user-uploaded media. Current R2 Free allowance includes 10 GB-month storage, 1 million Class A operations/month, 10 million Class B operations/month, and free egress for standard storage.

### Email

- ZeptoMail

Use ZeptoMail for transactional email only: sign-in codes and magic links, waitlist confirmations, moderation notices, comment notifications, and similar product emails.

Because authentication is passwordless (ADR-014), email delivery is on the **critical path for
login**, not only for notifications. SPF, DKIM, and DMARC must be correct before launch, and
GitHub OAuth is the fallback path during a mail outage.

### Bot protection

- Cloudflare Turnstile

Use it on unauthenticated or abuse-prone forms. Current Free plan supports up to 20 widgets and unlimited challenges.

### Charts

- Recharts only when needed

Recharts is an MIT-licensed React charting library. Use it for small dashboard visualizations; keep charts lazy/client-rendered and never make the public page depend on a chart library.

### UI

- shadcn/ui
- Tailwind CSS
- Lucide icons via shadcn ecosystem
- Inter font

Use shadcn/ui components as the baseline. Do not build a bespoke component system before it is needed.

## 3. Provider boundaries

Keep business logic independent from Cloudflare and Neon where possible.

```text
src/
  domain/       # Product/business rules
  services/     # application use-cases
  repositories/ # persistence interfaces + implementations
  integrations/ # GitHub, ZeptoMail, etc.
  app/          # Next.js routing/rendering
```

The domain layer should not import:

- Next.js request objects;
- Cloudflare bindings;
- Neon client;
- React components;
- ZeptoMail client.

This keeps the system portable.

## 4. Runtime boundaries

### Public read path

```text
Browser
  ↓
Cloudflare
  ↓
Next.js Worker
  ↓
Cached/server-rendered page
  ↓
Neon read
```

Public content should be cached whenever safe.

### Authenticated write path

```text
Browser
  ↓
Server Action / Route Handler
  ↓
Validation
  ↓
Authorization
  ↓
Domain service
  ↓
Repository
  ↓
Neon
```

### Media path

```text
Browser
  ↓
Signed upload / controlled upload endpoint
  ↓
R2
  ↓
Public CDN URL or signed access when appropriate
```

Do not send large files through database rows.

### Email path

```text
Domain event
  ↓
Email service
  ↓
ZeptoMail
```

The core business transaction must not depend on synchronous delivery of a notification email.

## 5. Rendering strategy

### Server Components by default

Use Server Components for:

- product pages;
- category pages;
- search result pages;
- profile pages;
- dashboard read views that do not require client state.

Use Client Components only for:

- interactive forms;
- comment composer;
- filters requiring instant client-side behavior;
- charts;
- image upload widgets;
- dialogs/dropdowns that require client state.

### Caching strategy

Start with framework-level caching and HTTP caching.

Do not introduce Redis solely for caching.

Use cache invalidation around:

- product publication;
- product update;
- comment creation if a public count changes;
- status changes;
- category/tag edits.

Use tags or equivalent invalidation primitives where appropriate and supported by the chosen Cloudflare deployment path.

## 6. Database principles

Use PostgreSQL as the source of truth.

Rules:

- **UUIDv7 primary keys** (ADR-021). The timestamp prefix keeps index inserts roughly
  sequential, which matters on the high-insert tables — comments and referral events — and gives
  creation ordering for free in cursor pagination. Public URLs use slugs and usernames; raw
  identifiers are never in a URL.
- **Slugs are unique, stable, and never reused.** A rename writes the old slug to
  `product_slug_history` and the retired slug permanently redirects to the canonical URL
  (ADR-019). This product's value is accumulated search authority on `/products/[slug]`, and a
  rename without a redirect discards it silently.
- Reserved slugs (`new`, `api`, `admin`, `u`, `status`, `categories`, and similar) are rejected
  at creation across every `/[slug]`-shaped namespace.
- **Soft deletion is the default for content, never for personal data.** Content stays so
  discussion context survives; personal data is erased or irreversibly anonymised per the
  retention matrix in [`LEGAL.md`](./LEGAL.md) §5.
- Moderation actions must be auditable.
- Never store derived counters without a reason. Prefer aggregate queries first; add denormalized counters only after profiling shows a need.
- Add indexes based on query patterns, not intuition alone.
- Every foreign key must have an intentional delete/update policy.

## 7. Search strategy

### MVP

Use PostgreSQL search only.

Start with:

- trigram/full-text strategy as appropriate;
- indexed name/description fields;
- category/status filters;
- prefix-friendly slug/name queries.

Do not introduce Elasticsearch/Algolia/Typesense until real search requirements justify it.

## 8. Referral tracking

Use a very small event table:

```text
referral_events
- id
- product_id
- referrer_source
- created_at
- coarse metadata if needed
```

Avoid storing raw IP addresses unless there is a documented security/abuse reason and a retention policy.

Aggregate dashboard data by day/week to reduce query cost.

### Retention is mandatory from the first migration (ADR-018)

`referral_events` is the fastest-growing table in this schema, and Neon's Free plan provides
0.5 GB of storage. Raw rows are retained for **30 days**; a daily rollup table holds
per-product, per-day aggregates indefinitely.

The rollup and prune ship in the **same migration that creates the table**. Adding retention
later means migrating a table that is already too large to migrate comfortably.

Dashboards and the "IMPOSTER DETECTED" calculation read the rollup, never the raw events.
Counting raw rows at render time is both the slowest and the most expensive way to answer a
question that only needs daily granularity.

This requires a scheduled job earlier than §9 anticipates. Use a Cloudflare Cron Trigger — the
smallest mechanism that does the work.

## 9. Future background jobs

The MVP should avoid queues.

When background work becomes necessary, evaluate Cloudflare Queues or Cron Triggers before adding external infrastructure.

Likely future workloads:

- GitHub synchronization;
- analytics synchronization;
- traffic summaries;
- email digest preparation;
- stale-link checks;
- automated status recommendations.

These should be isolated behind a job/service interface so the trigger mechanism can change later.

## 10. Scalability stages

### Stage 0 — MVP

- one Next.js Worker;
- one Neon database;
- one R2 bucket;
- ZeptoMail;
- no queue;
- no Redis.

### Stage 1 — growing directory

- CDN/cache tuning;
- database indexes;
- pagination/cursor improvements;
- read-heavy aggregate queries;
- scheduled jobs for non-critical work.

### Stage 2 — significant traffic

- dedicated cache layer only if measured necessary;
- read replicas or database scaling;
- job queues;
- search service if PostgreSQL search becomes a bottleneck;
- stronger observability.

### Stage 3 — large ecosystem

- integration workers;
- public API with rate limits;
- event-driven architecture for integrations;
- potentially split high-load workloads into separate services.

Do not skip stages based on hypothetical future traffic.

## 11. Observability

MVP:

- Cloudflare Workers logs;
- application error logging;
- structured event logs for security-sensitive actions;
- basic product analytics.

Later:

- external error tracking;
- tracing;
- metrics/alerts.

Never log:

- passwords;
- auth tokens;
- GitHub access tokens;
- email verification tokens;
- payment URLs if they contain secrets;
- full request bodies unnecessarily.

## 12. Dependency policy

Prefer small, maintained, focused libraries.

Required/expected families:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Drizzle ORM
- Neon serverless driver
- Zod for boundary validation
- a minimal schema/form helper only when useful
- Recharts for charts when needed
- Lucide icons through shadcn ecosystem

Avoid installing a library when 20–50 lines of maintainable code can solve the need safely.

## 13. Portability rule

Business logic must not depend directly on:

- Cloudflare-specific object shapes;
- Vercel-only APIs;
- Neon-only query calls outside the repository adapter;
- ZeptoMail calls inside domain services.

Platform-specific code belongs in adapters/integrations.
