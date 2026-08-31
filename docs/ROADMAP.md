# FailProducts — MVP Roadmap

## Phase 0 — Foundation

Goal: working skeleton with safe architecture.

- Next.js + TypeScript project.
- Cloudflare Workers deployment.
- shadcn/ui initialized.
- Tailwind configured.
- Inter font.
- Drizzle + Neon.
- R2.
- ZeptoMail adapter.
- Turnstile adapter.
- lint/typecheck/test tooling.
- docs and contribution files.

## Phase 1 — Accounts and product model

- registration/login;
- session handling;
- user profile;
- product schema;
- category/tag schema;
- product CRUD;
- status state machine;
- product status history;
- image upload.

## Phase 2 — Public directory

- homepage;
- product listing;
- product detail;
- category pages;
- status pages;
- search;
- SEO metadata;
- sharing metadata.

## Phase 3 — Community

- comments;
- replies only if needed;
- reports;
- founder replies;
- moderation dashboard;
- basic anti-spam/rate limits.

## Phase 4 — Waitlist and referrals

- waitlist toggle;
- signup;
- ZeptoMail confirmation;
- creator CSV export;
- outbound referral tracking;
- creator referral dashboard.

## Phase 4.5 — Seed the directory

**An empty failure directory is unusable.** The first visitor who arrives from search and finds
nine listings does not come back, and does not submit their own product either.

Because listings are owner-only (ADR-012), seeding is an outreach problem, not a scraping
problem, and it takes real calendar time. Budget for it as a phase rather than assuming it
happens during launch week.

- direct outreach to founders who have already written publicly about a product that did not work;
- indie-hacker, r/SaaS, and build-in-public communities where postmortems are already shared;
- the maintainer's own shipped-and-stalled projects;
- a target of roughly 50 to 100 published products with real failure narratives before launch;
- at least one worked example per category, so no category page is empty on arrival.

Quality matters more than count here. Ten honest postmortems make the product's case; a hundred
one-line stubs make it look abandoned.

## Phase 5 — Launch

Launch only when:

- core flows are stable;
- abuse controls exist, with a named rate-limit layer per endpoint (ADR-017);
- Terms, Privacy, content policy, and a delist / data-subject-request route are published and
  reachable without an account ([`LEGAL.md`](./LEGAL.md) §4 and §6);
- `LICENSE`, `NOTICE.md`, `TRADEMARK.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md` are present;
- **every page links to the source repository** — AGPL section 13 requires that users
  interacting over a network are offered the Complete Corresponding Source
  ([`../NOTICE.md`](../NOTICE.md)). A footer link satisfies it; its absence is a licence
  violation by the operator, not a missing nicety;
- branch protection, secret scanning, and push protection are enforced
  ([`../.github/BRANCH-PROTECTION.md`](../.github/BRANCH-PROTECTION.md));
- SPF, DKIM, and DMARC are verified — sign-in depends on mail delivery (ADR-014);
- the `referral_events` prune and rollup job is running (ADR-018);
- the cache hit ratio on public pages is verified against the Neon egress budget;
- open-source contribution guide works on a clean machine;
- backup/recovery process is documented **and tested once**;
- production monitoring is sufficient;
- the directory holds enough seeded content to be useful on arrival.

The full gate is in the `release-check` skill.

## Post-MVP 1 — Proof signals

- GitHub App;
- verified website;
- product update history;
- release activity;
- connected analytics providers.

## Post-MVP 2 — Recovery system

- traffic trend detection;
- verified analytics;
- comeback state;
- “IMPOSTER DETECTED” announcements;
- recovery case studies.

## Post-MVP 3 — Ecosystem

- public API;
- RSS feeds;
- embeddable badges;
- integrations;
- community contributor tools.

## Post-MVP 4 — Monetization

Only after meaningful usage exists:

- featured placements;
- creator promotion;
- verified profile/product services;
- optional premium analytics;
- sponsorships.

Paid links/backlinks must never become the sole value proposition.

## Product discipline

A feature should not enter the roadmap merely because it sounds useful.

Before adding infrastructure or a new integration, answer:

1. What user problem does it solve?
2. Is it used often enough?
3. Can the current architecture handle it?
4. What new operational work does it create?
5. Can we remove it later if it does not work?
