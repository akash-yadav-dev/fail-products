# Public content and page inventory

**Status:** Prelaunch inventory, 2026-09-28. This page describes the content to
review before launch. It does not replace the product, legal, or moderation
specifications.

## Routes and content

| Route | Purpose and current content | Source | Indexing and launch work |
| --- | --- | --- | --- |
| `/` | Explain the directory, its tone, and where to browse or submit. | Editorial copy in the page. | Indexable. Add a bounded recent/featured section when real owner stories exist; do not surface fixtures. |
| `/products` | Browse, search, sort, and filter public listings. | Published, visible database rows. | Canonical bare path. Review search relevance and empty-state copy with real content. |
| `/products/[slug]` | Owner-attributed status, story, website, discussion, waitlist, and related listings. | Owner submission plus separately labelled community comments and platform click counts. | Index only a useful published listing. Review every story, media right, and claim source before launch. |
| `/categories` and `/categories/[slug]` | Browse the fixed category taxonomy and its listings. | Curated taxonomy plus public rows. | Index a category landing page only when it offers useful content. Check each category has a genuine example. |
| `/status` and `/status/[slug]` | Explain owner-selected status and browse matching listings. | Fixed status definitions plus public rows. | Review thin or empty pages before indexing. |
| `/u/[username]` | Show a creator profile. | Account profile; any product list must use public visibility rules. | Verify profile content and owner consent before indexing. |
| `/about` | Explain the purpose, owner-only listings, community tone, and open-source model. | Editorial copy; current page exists. | Check copy after the first genuine stories are approved. |
| `/guidelines` | Public summary of allowed listings, comments, sourcing, reports, and appeal limitations. | `MODERATION.md` and `LEGAL.md`; current page exists. | Verify wording matches actual moderation operations. |
| `/submit` | Tell owners who may submit and guide a signed-in owner to create a draft. | Product rules; current page exists. | Verify the published form matches the final MVP field set and media path. |
| `/auth/sign-in` | Explain passwordless email and GitHub sign-in. | Auth UI; current page exists. | `noindex`; verify provider delivery in preview. |
| `/terms`, `/privacy`, `/takedown` | Legal terms, data handling, and an account-free objection/request path. | Terms and Privacy are incomplete placeholders. Takedown shows a mail link only when `LEGAL_CONTACT_EMAIL` is valid; development mode shows a clearly labeled reserved example address and sample request details. | `noindex` until reviewed, dated content and a tested mailbox process exist. Do not launch with placeholders. |
| `/waitlist/confirm`, `/waitlist/unsubscribe` | Email link destinations and consent state changes. | Transactional flow. | Do not present as editorial landing pages; verify mail, token handling, and removal end to end. |
| `/go/[slug]` | Outbound click recording and redirect. | Visible product destination. | Not content; excluded from crawling. Verify count and destination in preview. |
| `/demo` | Three fictional SaaS stories for local layout review. | Static development-only samples. | `noindex`; returns 404 outside development; never submit or copy into the public directory as factual accounts. |

Private `/dashboard` routes and `/api` handlers are operational surfaces, not
public content pages. The sitemap should list only useful, indexable public
routes and visible products. `robots.txt` is crawl guidance, not access control.

## What a real launch listing needs

Each owner-approved story should answer these questions in the owner's words:

1. What did the product do, for whom, and when was it available?
2. What did the founder expect would happen?
3. What evidence supports the founder's chosen status? Do not invent traffic,
   users, revenue, or customer quotes.
4. What failed, stalled, or changed? Attribute causal explanations to the
   founder or a named source.
5. What would the founder do differently, and what might another builder learn?
6. Is the website still safe and available? Are any logo or screenshot rights
   controlled by the owner?
7. Does the owner approve publication, the status label, and the final wording?

Keep creator claims, community opinions, and platform-observed signals visually
distinct (`LEGAL.md` §3). The platform records outbound **clicks**, not unique
visitors or a product's total traffic. An empty field is preferable to a
plausible but unsourced number.

## Development-only samples

`/demo` contains **SignalDesk Demo**, **RenewalPilot Demo**, and **BriefBoard
Demo**. All names, audiences, outcomes, and lessons are fictional. The page
uses static data and never opens `.env.local` or the database. It exists to
review copy density and layout while genuine owner stories are collected.

The actual `/products` directory remains database-backed. Test fixtures seen
there are not launch content. Do not migrate these fictional samples into
production or let them enter a sitemap as real listings.

## Publication checklist

- Obtain an owner's final approval for every real listing and any media.
- Check source labels and avoid claims about third parties that cannot be
  supported (`MODERATION.md` §8; `LEGAL.md` §3).
- Review a phone and desktop rendering, headings, alt text, outbound links,
  canonical URL, and sharing image.
- Confirm a report control and a working account-free correction/delist path.
- Remove local fixtures from the launch environment and confirm every indexed
  category and status page contains useful content.
- Run the release checklist only after Terms, Privacy, and contact handling are
  reviewed and published.
