---
name: performance
description: Keep pages fast and infrastructure cheap on Cloudflare Workers and Neon. Use when adding a page or route, adding "use client", writing a list query, adding an image or chart, changing caching, or investigating slowness. Enforces measure-before-optimising, cursor pagination, cacheable public pages, and the cost guardrails.
---

# Performance

## Purpose

On FailProducts, performance is three things at once: user experience, SEO ranking, and the
monthly bill. Workers bills CPU. Neon meters compute and caps egress. A slow public page costs
a solo-funded project real money every month.

This skill keeps public pages fast and cacheable, keeps queries bounded, and — just as
importantly — stops optimisation that nobody measured.

## When to use it

- Adding a page, route handler, or list view
- Adding `"use client"` to anything
- Writing or changing a query
- Adding an image, a font, a chart, or a dependency that ships to the browser
- Changing caching or revalidation
- Investigating something that feels slow

## Context you need first

- `docs/ENGINEERING.md` §7 performance, §3 server/client, §5 database
- `docs/ARCHITECTURE.md` §5 rendering and caching, §8 referral rollups
- `docs/DEPLOYMENT.md` §10 cache strategy, §11 cost guardrails
- `docs/PRODUCT.md` §9 SEO, §14 non-functional targets

## The two admissible grounds for optimising

`docs/ENGINEERING.md` §1.6 says optimise after measuring, and `AGENTS.md` §3 forbids assuming
what can be checked. Together they mean an optimisation needs **one** of these:

**1. A measurement.** A query plan, a bundle report, a timing, a Lighthouse or CrUX number.
Cite it with the number.

**2. A structural reason.** A defect that is true by construction regardless of today's
numbers:

- an unbounded query has no upper bound — the row count is the only thing standing between it
  and a timeout
- an N+1 scales linearly with rows by definition
- a public page that fetches a per-request external API cannot be cached
- a client boundary ships every module below it, whatever the current bundle size is

These need no benchmark, because the problem is not the current magnitude.

Anything that is neither is speculation. Do not act on it, and do not report it as a finding.

## Rules

### Rendering

**Server Components by default.** `"use client"` only for genuine browser state or event
handlers. The boundary is contagious — everything imported below it ships to the browser.

Public pages — the directory feed, `/products/[slug]`, `/categories/[slug]` — must render
meaningful content **without JavaScript**. `docs/PRODUCT.md` §9 depends on it for indexing, and
indexing is where this product's traffic comes from.

Do not force dynamic rendering by accident. Reading cookies, headers, or `searchParams` in a
page that did not need them opts the whole route out of static rendering.

### Caching

Start with framework-level and HTTP caching. **No Redis** — `docs/ARCHITECTURE.md` §5 and
ADR-008.

Invalidate on the events that actually change public output (`docs/ARCHITECTURE.md` §5):
product publication, product update, status change, a comment that changes a visible count,
category or tag edits. Tag-based invalidation beats a short blanket TTL: the TTL re-renders
everything on a timer whether or not anything changed, which is the expensive way to be wrong.

Caching is a budget, not an optimisation — `docs/DEPLOYMENT.md` §11. An uncached public
directory exhausts Neon egress long before it exhausts anything else.

### Database

- **Every list is cursor-paginated with a hard cap.** Not offset — it degrades with depth and
  skips rows under concurrent writes.
- **No N+1.** Batch or join. A service looping and querying per item is a defect.
- **No `SELECT *`** on a hot path.
- **Read the rollup, never the raw events.** Counting `referral_events` at render time is
  explicitly rejected by ADR-018 — it is both the slowest and the most expensive way to answer
  a question that needs daily granularity.
- **Indexes follow measured access patterns.** Write the query, run `EXPLAIN ANALYZE`, then
  index. See the `database` skill.

### Bundle

- Check the real number, not your recollection: `npm view <pkg> dist.unpackedSize`, and the
  build output once one exists.
- Charts are lazy, client-only, and never on a public page path.
- Import what you use. A default import of a whole utility library is a finding.
- No dependency that duplicates something already bundled.

### Images and fonts

- `next/image`, or the Cloudflare-compatible path, with `width`, `height`, and `sizes` set —
  missing dimensions are the main source of CLS.
- The LCP image is eager and preloaded; everything below the fold is lazy.
- Uploads are resized client-side, stored in R2, and transformed on read (ADR-020). Never serve
  a full-size original.
- Inter via `next/font` — self-hosted, no runtime Google fetch, `font-display: swap`.
- Do not commit large binaries. Check before adding:

```bash
find public/ -type f -size +200k -exec ls -lh {} \; 2>/dev/null
```

### Network and cost

- No per-request external API call on a public page — it defeats caching and bills twice.
- No background polling, no client-side interval refetching.
- **No unauthenticated endpoint that triggers unbounded database work.** That is a billing
  vulnerability as much as a performance one; the `security-reviewer` owns it too.
- Debounce dashboard search inputs; do not refetch unchanged data.

### Core Web Vitals

LCP, CLS, INP. The usual causes here: an unsized image, a late-loading banner, a client
boundary that did not need to exist, and a font that shifts on load.

## Checks

```bash
grep -rn '"use client"' src/ 2>/dev/null              # justify every one
grep -rn "\.offset(" src/ 2>/dev/null                 # offset pagination
grep -rn "SELECT \*\|select()" src/ 2>/dev/null
grep -rn "<img \|setInterval\|setTimeout" src/ 2>/dev/null
find public/ -type f -size +200k -exec ls -lh {} \; 2>/dev/null
```

Empty output is a result. Record it as checked, not as absent.

## Common mistakes

- Optimising something nobody measured, and calling the guess a finding.
- Marking a page `"use client"` because one leaf component needs state.
- Offset pagination on a feed "because the dataset is small right now".
- A blanket 60-second revalidate instead of tag invalidation on publish.
- Counting raw referral events for a dashboard number.
- An unsized `<img>` that shifts layout after load.
- Adding a dependency for a formatting job `Intl` already does.
- Treating "it works locally" as evidence. Local has no cold start, no colocation latency, and
  no egress meter.

## Verification expectations

- Every claim carries either a number or the structural rule that makes it true.
- Query changes carry `EXPLAIN ANALYZE` output.
- Bundle claims carry a real size from the build or the registry.
- Provider limits are checked against primary documentation, **with the date recorded** —
  Cloudflare and Neon allowances move.
- If nothing can be measured yet, say so and restrict findings to structural ones. Never
  present a guess as a benchmark.

## Exit criteria

```
[ ] every "use client" justified
[ ] public pages render meaningfully without JavaScript, and are cacheable
[ ] every list is cursor-paginated with a hard cap
[ ] no N+1; no unbounded query; no render-time aggregation of raw events
[ ] new indexes backed by a query plan
[ ] images sized, lazy below the fold, served transformed from R2
[ ] no chart library on a public page path
[ ] no per-request external call on a public page; no background polling
[ ] no unauthenticated endpoint doing unbounded database work
[ ] measurements recorded in the PR, or the reason none exist stated plainly
```

Run the `performance-reviewer` agent on any change to rendering, queries, caching, or bundle —
[`docs/AI-WORKFLOW.md`](../../../docs/AI-WORKFLOW.md#4-agent-routing).
