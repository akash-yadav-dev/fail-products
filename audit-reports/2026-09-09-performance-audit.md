# Performance audit and optimization plan

Date: 2026-09-09. Reviewed baseline: `aea16a5`.
Remediation report updated: 2026-09-10.
Status: **All nine findings implemented on `fix/performance-audit-followup`; verification
limits are recorded below.**
The findings below preserve the original audit evidence. Implementation updates are recorded
under each finding; source fixes and completed verification are distinguished explicitly.
Review and remediation performed without subagents, using the repository performance,
testing and database skills. The branch depends on the preceding unmerged security work.

## Remediation tracker

| Finding | Current status | Verification |
|---|---|---|
| PERF-01 | FIXED | Instrumented production render: one detail/profile lookup each |
| PERF-02 | FIXED | One dashboard session read; next request rejects a revoked session |
| PERF-03 | FIXED; migration required on other environments | Synthetic before/after plans, development migration, real cleanup regression |
| PERF-04 | FIXED | Warm-cache moderator browser regression at both viewports |
| PERF-05 | FIXED IN SOURCE | Matching built cache tags verified; full latent edit/state matrix remains NOT_VERIFIED |
| PERF-06 | FIXED | Filtered search/clear with and without JavaScript at both viewports |
| PERF-07 | FIXED | Hydrated query/history/back/forward behavior at both viewports |
| PERF-08 | FIXED | Real first-sign-in SQL budget and valid session; existing auth suite |
| PERF-09 | FIXED | Declared image slots match rendered widths at both viewports |

FIXED denotes implemented and locally verified behavior, not a deployment or a production
speedup. Section 4 remains a measurement backlog, not a list of defects requiring speculative
changes. No new infrastructure or dependencies were added.

## 1. Original findings-stage scope and evidence

This is the performance handoff following the [security audit](2026-09-09-security-performance.md).
It covers database work, request waterfalls, rendering, cache correctness, search navigation,
static assets, and likely growth bottlenecks. It does not reopen or certify the security audit.
The security report records its own integration results; those tests were not rerun for this
documentation-only pass. The working tree was clean when this pass began.

Evidence consists of current source inspection and a read-only inventory of existing local
build artifacts. No database writes, schema changes, deployment, new dependency, or application
changes were made. Local build artifacts have no verified commit provenance, so their sizes
are a preliminary baseline, not a reproducible production benchmark.

**Confirmed** means the described behavior follows from source. It does not mean its elapsed
time or frequency has been measured. **Measure first** entries are investigation tasks, not
assertions that the application is slow. Priorities express implementation order, not security
severity: P1 correctness and avoidable hot-path work; P2 smaller savings; P3 measured growth work.
No percentage speedup, production latency, cache-hit ratio, or monthly saving is established.

## 2. Prioritized findings

| ID | Finding | Evidence/status | Priority | Suggested effort |
|---|---|---|---|---|
| PERF-01 | Product and profile metadata repeat page lookups | Confirmed call duplication; runtime query count unmeasured | P1 | Small |
| PERF-02 | Dashboard layout and child repeat session lookup | Confirmed call duplication; runtime query count unmeasured | P2 | Small |
| PERF-03 | Auth cleanup bounds deletions, not rows examined | Confirmed structural growth risk | P1 investigation | Medium |
| PERF-04 | Category count cache is omitted from moderation invalidation | Confirmed missing invalidation; warm-cache reproduction pending | P1 | Small |
| PERF-05 | Product edit/state bindings have incomplete invalidation | Confirmed latent defect; no current app callers found | P1 before exposing edits | Medium |
| PERF-06 | Search discards active filters | Confirmed navigation defect | P1 | Small |
| PERF-07 | Search input does not follow later URL query changes | Confirmed missing synchronization; browser reproduction pending | P2 | Small |
| PERF-08 | First email sign-in rereads a just-created user | Confirmed redundant read on successful insert | P2 | Small |
| PERF-09 | Every logo size advertises an 80px image slot | Confirmed size mismatch; transfer impact unmeasured | P3 | Small |

### PERF-01 — Deduplicate metadata and page reads within a render

**Implementation update:** FIXED AND VERIFIED LOCALLY — shared product/profile read bindings
use React request-scoped `cache`. Instrumented production-server HTTP tests observe exactly
one detail SELECT per cold product render and one profile SELECT for metadata plus body.

**Evidence:** `src/app/(site)/products/[slug]/page.tsx:95,129` calls
`resolvePublicProduct(slug)` twice. `src/services/product/server-product.ts:92` delegates each
call directly to the use case and repository. Likewise, the profile page calls
`getPublicProfile(username)` at lines 33 and 54, and `services/user/server-profile.ts:23`
has no request memoization. These are database calls, not an explicit application fetch cache.

**Impact:** On a product cache miss, metadata and body request the same full detail row.
Missing/retired slugs also repeat resolution work. Profiles have the same duplication.
Product ISR hits do not run these page functions, so savings apply to builds, regeneration,
and cold renders rather than every cached visit. The detail page already runs related listings
and comments concurrently; that part should remain concurrent.

**Proposed fix:** Wrap the shared read binding in request-scoped React `cache`, following the
existing `findUserRole` pattern. Both consumers must import the same wrapper. Keep authorization
and public visibility predicates intact. Do not replace this with a cross-request cache of
private data. Verify the installed React/Next guidance before implementation.

**Acceptance:** Instrument actual database calls during a cold production-mode render. Metadata
and body together issue one detail lookup for a found product and one profile lookup for a
valid handle. Missing/renamed cases retain 404/redirect behavior. A subsequent request must see
fresh data according to the route's intended caching policy. Record before/after counts and
timings; do not infer that removing one query halves total page latency.

### PERF-02 — Avoid repeated dashboard session reads

**Implementation update:** FIXED AND VERIFIED LOCALLY — the shared session binding uses
request-scoped `cache`, retaining token/time arguments and empty-token early return.
Instrumented dashboard/settings requests issue one session SELECT. Revoking the session
then making another request issues a fresh SELECT and redirects to sign-in.

**Evidence:** `src/app/(dashboard)/dashboard/layout.tsx:40` calls `getSessionUser`;
products, settings, and moderation child pages call `currentUserOrNull`, which calls
`currentUser` and then the same session lookup. `services/auth/server-auth.ts:25` is not
memoized. Role reads already use request-scoped caching.

**Impact:** Initial dashboard renders can repeat session hashing and the session/user join.
Client navigation may reuse the layout, so this is not a promise of two queries on every navigation.

**Proposed fix:** Share a request-scoped session reader across layout and child pages. Preserve
empty-token early return and all action-side authentication. Keep time-dependent test parameters
outside an ambiguous cache key. Never cache sessions across requests.

**Acceptance:** One session database lookup per initial authenticated render; revoked sessions
and demoted moderators lose access on the next request. Verify anonymous redirects, expired
sessions, and that the local navigation bypass never becomes action authorization.

### PERF-03 — Auth housekeeping still scans on the critical path

**Implementation update:** FIXED IN SCHEMA; migration applied to the user-confirmed isolated
development branch. `0013_auth_cleanup_indexes.sql` adds expiry indexes and sparse
consumed/revoked indexes. Cleanup frequency, candidate predicate, 100-row write bounds,
and validity checks are unchanged. No deployment migration has been applied.

Measured in a transaction-local synthetic table with 100,000 live rows and no cleanup
candidates: before, sequential scan removed 100,000 rows by filter and touched 541 local
blocks (5.618ms execution); after, bitmap index scans touched three local blocks (0.050ms).
Raw plans: [cleanup-plans.json](2026-09-09-cleanup-plans.json). This is one synthetic sample
of candidate selection, not production request latency or a full auth benchmark. PostgreSQL
may still choose a sequential scan on small tables or large backlogs. The indexes remove the
need to scan all live rows in the measured sparse-candidate case, not all possible linear work.
The real-database cleanup regression passes: expired/consumed tokens and expired/revoked
sessions are deleted, while live credentials remain. No production latency saving is claimed.

**Evidence:** `repositories/auth-repository.ts:17–26` batches two deletes whose candidate
subqueries each use `LIMIT 100`. Their filters inspect expiry or consumed/revoked state.
`db/schema/auth.ts:25–28,45–47` has no index aligned to those filters. Both allowed code requests
and allowed verifications await cleanup (`services/auth/auth-service.ts:30,43`).

**Bug/risk:** A limit of 100 bounds affected rows. It does not bound the rows inspected to find
them. With many live sessions and few expired ones, the candidate query may inspect the entire
table and delete nothing. The prior audit correctly reduced write volume and moved cleanup
behind limits, but it did not eliminate this growth risk. Output limits on other queries also
must not be interpreted as scan limits.

**Proposed approach:** First capture `EXPLAIN (ANALYZE, BUFFERS)` for equivalent read-only
candidate SELECTs on an isolated development branch with realistic live/expired distributions.
Compare every-request cleanup with bounded, less frequent cleanup and a measured index strategy.
Choose a cadence consistent with documented retention; a probabilistic sweep alone cannot
promise a maximum retention interval during quiet traffic. Do not add a queue or another store.

**Acceptance:** Record rows examined, buffers, cleanup frequency, and auth p50/p95 before/after.
Test zero expired rows and an expiry backlog. Expired/revoked tokens remain rejected even when
housekeeping is skipped, and retained data still meets the documented retention policy.
Do not run `EXPLAIN ANALYZE DELETE` against an unidentified database: it executes the deletion.

### PERF-04 — Moderation leaves the category index count stale

**Implementation update:** FIXED AND VERIFIED LOCALLY — categorized product moderation also
invalidates `/categories`. On both viewports, a production-mode browser test warms the count
and detail page, hides a listing through the moderator form, and observes a decremented
count and a 404 detail page.

**Evidence:** `app/(site)/categories/page.tsx:31,48–50` caches visible-product counts with a
3,600-second revalidation interval. `app/(dashboard)/dashboard/moderation/actions.ts:79–99`
invalidates the product, product subtree, sitemap, category detail, and status detail, but
does not invalidate `/categories`.

**Trigger/impact:** Warm the category index, then hide or restore a published categorized
product. The category detail is invalidated but its index count can remain stale until
revalidation. The source comment claiming the count and detail always agree overlooks caches.
The TTL is a revalidation interval, not a guaranteed maximum staleness during failed regeneration.

**Proposed fix:** Invalidate the category index when a transition changes counted public
visibility. Keep this event-based; shortening every TTL would spend more reads without ensuring
immediate consistency.

**Acceptance:** Warm both pages on a production-mode server, hide and restore a product through
the real moderator action, and verify counts and cards converge immediately after successful
invalidation. Confirm unauthorized actions do not invalidate pages. Repeat on the deployment
runtime before declaring its cache behavior verified.

### PERF-05 — Define the complete product mutation cache contract

**Implementation update:** FIXED IN SOURCE — edit/publication/status/moderation bindings now
invalidate before/after detail and landing URLs, category counts, sitemap and the product
subtree after successful mutation. Added reads capture actual before/after resources; no
authorization check was removed. The extended moderator browser regression verifies warm
counts, related cards on a second product, changed OG image output, and the hidden product's
404 on both viewports. The complete matrix for currently unused edit/state bindings remains
NOT_VERIFIED; those bindings have no application UI/route callers.

**Verified correction to prior security report R02:** Current `.next/server/app/**/*.meta`
files explicitly contain `_N_T_/(site)/products/layout`, including OG routes. The installed
`implicit-tags.js` derives layout tags from the page path without stripping groups. The
moderator action now uses that matching group-qualified path. The historical claim that
`/products` layout invalidation covered this subtree was incorrect; literal detail URLs remain
valid independently. The extended browser regression now verifies related-card and share-image
invalidation through the real moderator action as well.

**Evidence:** `services/product/server-product.ts:57–89` invalidates only the new and old
detail URLs after an edit. Publication, failure-status, and moderation wrappers perform no
invalidation. Current `src/app` searches found no callers for these edit/state wrappers;
the live moderator action uses its own explicit invalidations.

**Latent bug:** When an editing/publishing UI is wired to these bindings, related cards,
category/status pages, category counts, sitemap metadata, and share images may retain old
names, URLs, status, or visibility. The binding's comment promises every changed URL, but its
implementation covers only detail URLs.

**Proposed fix:** Before exposing these mutations, enumerate affected surfaces using both
the before and after resource. Put the smallest complete invalidation logic in the existing
server binding layer. Preserve broad takedown invalidation where necessary for correctness;
do not narrow it merely to improve the hit ratio. Only introduce tags after confirming actual
installed framework and deployment support. Do not copy untested route-group assumptions
from historical audit notes.

**Acceptance:** A warm-cache matrix must cover rename, category move, status change, publish,
archive, hide, and restore. Check old/new URLs, related cards on other products, counts,
sitemap, and OG images. Measure how many pages regenerate per event. Service tests alone
cannot establish cache correctness.

### PERF-06 — Search silently broadens a filtered directory

**Implementation update:** FIXED AND VERIFIED LOCALLY — validated category/status are
preserved in debounced navigation and native GET fields. Browser regressions pass at both
viewports with and without JavaScript, including clearing the query and retaining focus.

**Evidence:** `components/products/product-search.tsx:45–48` constructs empty URLSearchParams
and adds only `q`. Its no-JavaScript GET form likewise submits only `q`.
`app/(site)/products/page.tsx:52–76` supports and intentionally preserves category/status
elsewhere, but passes only `initialQuery` to the search component at line 102.

**Reproduction:** Visit `/products?category=<valid-slug>&status=<valid-slug>`, then search.
Navigation drops both filters. The UI shows a broader query than the visitor selected and can
cause corrective navigation and additional database work. The correctness defect is established;
the extra traffic magnitude is not measured.

**Proposed fix:** Pass validated active filters into the form and preserve them in both the
debounced URL and hidden GET fields. Clear the old cursor when the query changes. The existing
sort reset is explicitly intentional; retain it unless the product specification changes.

**Acceptance:** With and without JavaScript, typing/submitting a search preserves category
and status and clears the old cursor. Clearing search retains filters. Confirm the 300ms
debounce still produces one settled navigation rather than an additional native form submit.

### PERF-07 — Search local state can disagree with the URL

**Implementation update:** FIXED AND VERIFIED LOCALLY — `useSearchParams` supplies the current
URL query; state reconciles without remounting the focused field. Hydrated history navigation,
back/forward, and focus regressions pass at both viewports. An initial test raced hydration;
the final test establishes a completed client search before exercising history navigation.

**Evidence:** `components/products/product-search.tsx:28,33` initializes state and its
`applied` ref from `initialQuery` once. There is no synchronization when that prop later changes.

**Trigger/impact:** Navigation that reuses this client component with a different query can
leave the textbox showing the previous term while the server renders the new results.
Exact preservation behavior across each navigation path needs browser reproduction. This is
primarily a state-correctness issue; do not claim a measured render-cost improvement.

**Proposed fix:** Reconcile URL-derived query changes with local editing state without
starting a second debounce/navigation loop. Consider a query-keyed remount versus explicit
synchronization; test focus and in-flight typing before selecting the simpler behavior.

**Acceptance:** Back/forward, external query links, filter navigation, and rapid edits keep
textbox and results consistent without resetting focus or replaying an obsolete query.

### PERF-08 — Use the inserted user ID on first email sign-in

**Implementation update:** FIXED AND VERIFIED LOCALLY — successful insertion supplies the
user ID; only an insert conflict triggers a fallback lookup. A real-database performance test
observes one account SELECT on first sign-in and validates the resulting session. Existing
auth concurrency and single-use tests also pass.

**Evidence:** `auth-service.ts:51–52` reads the account, inserts when missing, then always
rereads it. `auth-repository.ts:80–81` already returns the inserted ID. The GitHub path uses
that return value and only rereads after a conflict.

**Impact/fix:** Successful first email sign-in can save one sequential database read by using
the insert result. Retain the fallback lookup if a concurrent creation wins the unique-email
conflict. This improves first sign-in only; existing-user sign-in has no extra insert reread.

**Acceptance:** First sign-in, existing-user sign-in, and concurrent first sign-ins all produce
the correct account/session. Demonstrate one fewer SELECT when insertion succeeds. Preserve
atomic OTP consumption and account-existence-safe responses.

### PERF-09 — Match logo image sizes to rendered variants

**Implementation update:** FIXED AND VERIFIED LOCALLY — each variant declares its real
responsive slot width. Browser tests compare visible logos' rendered widths and declarations
at both viewports. Transfer-size/DPR savings remain unmeasured; no saving is claimed.

**Evidence:** `components/layout/site-logo.tsx:14–17` renders 32px, 36/40px, or 64/80px
variants, but line 46 always declares `sizes="80px"`. The source PNG is **47,331 bytes**.

**Impact/fix:** Small variants advertise a larger slot than they render and may select a
larger image candidate. Use variant-specific sizes. Whether this saves transferred bytes
depends on DPR, candidate widths, shared browser cache, and the deployed image path.
The existing explicit dimensions are good and should stay.

**Acceptance:** Inspect `currentSrc`, natural/rendered width, transfer size, and layout shifts
at mobile/desktop widths and DPR 1/2. A page sharing a larger hero logo may already reuse its
asset; report that rather than claiming a universal saving.

## 3. Improvements already present — retain them

| Existing improvement | Current evidence | Qualification |
|---|---|---|
| Narrow directory-card projection | `product-repository.ts:70–80` omits description, website and logo fields | Prior audit's modeled egress savings are not new measured production savings |
| Bounded owner history selection | `latestModerationByOwner:237–260` selects the same latest 50 products | History work within those 50 products can still grow |
| Stable owner ordering | `listByOwner:214–217` sorts by updated time and ID | Keep the same ordering in the history subquery |
| Batched, post-limit auth cleanup | `auth-repository.ts:17–26`, auth service | Retain its write bound while investigating PERF-03 |
| Concurrent independent detail reads | Product page lines 158–161 | Related listings and comments already run together |
| Cursor listing and search index | Product repository; `schema/products.ts:114–122` | An index and a LIMIT do not prove constant scan cost |
| Intentional cached landing pages | Product detail uses 300s; category index 3,600s | Dynamic `/products` query handling is intentional, not an accidental regression |
| Interactive leaf search with debounce | Search component | Fix filter/state behavior without moving the list into the browser |

## 4. Measure-first backlog — not confirmed slowness

| Area and source | What to measure | Smallest possible response if justified |
|---|---|---|
| Latest owner moderation: `product-repository.ts:237` | EXPLAIN with many history rows per each of 50 products | Compare current DISTINCT ON with a single-query latest-row lateral lookup; no network N+1 |
| Recent moderation: `report-repository.ts:292–323` | Table size, buffers, sort and p95 of global latest-50 query | Follow its existing documented growth trigger; evaluate created-at index or a date boundary |
| Public listing index: `schema/products.ts:114–119` | Deep cursor and filtered plans; current index lacks the ID tiebreak column | Compare a matching composite index only after measured plans justify write/storage cost |
| Global providers/fonts: `app/layout.tsx:19–28,59–68` | Route-specific compressed JS, hydration CPU, font usage/preloads | Scope optional UI providers or font loading only if measurements justify it |
| Product/OG prerendering | Build time and SQL counts at realistic listing counts | Keep the existing 1,000-product cap; consider a smaller prebuilt subset after runtime caching is verified |
| Broad moderation invalidation | Warm cache hit ratio and regenerations after real events | Retain correctness-first invalidation until a tested narrower strategy covers every disclosure surface |

Geist Mono is used by the error UI (`src/app/error.tsx:63`); it is not an unused font that can
simply be deleted. There is no basis here for adding Redis, queues, a separate search service,
read replicas, or additional application infrastructure.

## 5. Local artifact inventory

Read on 2026-09-09 by recursively summing filesystem byte sizes; no server or database was
started. Values below are raw disk bytes, not compressed network transfers or per-route bundles.

| Artifact | Observation |
|---|---:|
| `public/` | 1 file; 47,331 bytes, entirely `brand/logo.png` |
| `.next/static/` | 44 files; 1,374,245 bytes across all routes |
| Largest existing JS chunk | 234,155 bytes |
| Existing generated CSS chunk | 106,168 bytes |
| Existing homepage HTML | 113,913 bytes |
| Two font files referenced in homepage HTML | 23,108 and 48,432 bytes |

**UNVERIFIED:** Existing `.next` artifacts were not rebuilt or tied to `aea16a5` in this pass.
These figures justify collecting a reproducible route waterfall; they do not establish bundle
bloat. Summing all chunks would overstate a visitor's download, and HTML link/script discovery
alone does not establish what the browser fetches, caches, executes, or prefetches.

## 6. Implementation and verification order

1. Reproduce and fix PERF-04 and PERF-06, then PERF-07. These prevent stale or unintended
   results. Add behavior regression tests, including warm production cache checks and no-JS search.
2. Implement PERF-01, PERF-02, and PERF-08 with query-count evidence and authentication
   regression coverage. Avoid persistent auth caching or removing authorization reads across requests.
3. Measure PERF-03 on an explicitly identified development branch and choose cleanup behavior
   that meets retention requirements. Any index gets a before/after query plan and migration.
4. Complete PERF-05 before connecting product editing/publication routes. Test its full cache
   matrix rather than treating a mocked `revalidatePath` call as proof.
5. Measure route assets and PERF-09; pursue the growth backlog only when evidence warrants it.

For reproducible measurements, record commit, Node/package versions, production build command,
runtime/adapter, browser, region, database branch/region, fixture counts and text lengths,
compression, viewport/DPR, and cold-versus-warm state. Record query count separately from SQL
execution time and HTTP round-trip time. Use repeated samples (for example, 30 per state), report
sample count, median and p95, and preserve raw results. Apply identical conditions before/after.

Route set: homepage, directory first/deep/search pages, category index/detail, product detail
including comments, public profile, dashboard products/settings/moderation, and first email
sign-in. Measure warm cache behavior separately from regeneration. A fast empty/no-database
build is not a benchmark for the populated directory.

Run targeted regression tests for each actual change, then typecheck, lint and production build.
Database integration tests require an explicitly identified development branch. Before pushing,
run the repository verification gate and report skipped checks as NOT_VERIFIED. Do not run tests
that send real email or modify an unidentified database for this report.

## 7. Current verification and remaining limits

The user confirmed that the current DATABASE_URL points to an isolated development branch
and authorized fixture creation/cleanup. Migration 0013 applied successfully there. The full
existing integration suite passed 151 tests; the new performance integration file passed
two more. The final repository gate reran all 620 tests together successfully. Production
build and typecheck passed. The performance browser checks and instrumented rendering checks
also passed at both viewports.

| Final check | Result | Evidence/qualification |
|---|---|---|
| Unit + integration | **PASS: 620 tests / 38 files** | 467 unit + 153 integration; confirmed development database |
| Typecheck | **PASS** | `tsc --noEmit`, then the gate's `pnpm typecheck` |
| Lint | **PASS** | Final gate; tracing helper converted to ESM after lint rejected CommonJS |
| Production build | **PASS: 305 static pages** | Populated development database; no production deployment implied |
| Full Playwright suite | **204 passed, 16 skipped** | Both 360px and 1280px; local production server, one worker |
| Extended cache regression | **2 passed** | Follow-up at both viewports verifies counts, related cards, changed share-image output and detail removal |
| Instrumented render budget | **PASS: both viewports** | Included in the full browser run; fresh revocation check also passed |
| Repository verification gate | **PASS — no findings** | `bash scripts/verify-changes.sh`; local log `2026-09-09-gate.log` |
| Migration 0013 | **PASS on development branch** | Additive indexes only; not applied to any production database |
| Diff whitespace check | **PASS** | `git diff --check` |

Browser skips: ten tests apply only to the opposite viewport (desktop sidebar/header versus
mobile sheet/menu). Six error-boundary fault-injection cases skip when PLAYWRIGHT_BASE_URL
is set; the suite pointed at a separately started local production server to enable query
tracing. Those six are NOT_VERIFIED in this run, not passes. No database-backed browser test
was skipped for missing credentials.

The gate computes its range against `origin/dev`, so it includes preceding unmerged security
and implementation commits. It classified the combined change as PRODUCTION-CRITICAL.
This performance task's application delta starts at `aea16a5`; exports converted to cached
functions remain available under the same names. No reviewer subagents were launched, as
requested; the gate's routing suggestions do not constitute independent reviewer sign-off.

### Changes delivered

- Request-scoped product, profile and session read deduplication in existing server bindings.
- First email sign-in uses the inserted account ID and retains a conflict fallback lookup.
- Four measured auth cleanup indexes, generated SQL migration and matching Drizzle snapshot.
- Category-count invalidation after moderation and complete before/after invalidation in
  product edit/state bindings, including related cards and share-image subtree tags.
- Search retains validated category/status filters in both JavaScript and native GET forms;
  current query changes synchronize without remounting the input.
- Responsive logo `sizes` now follows the small, medium and large visual variants.
- Regression tests for cleanup, sign-in query budget, search/filter/history/focus, image slots,
  warm-cache moderation, render query counts and next-request session revocation.
- Reproducible local query-classification tracing helper and raw synthetic cleanup plans.
- Correction to the preceding security report's inaccurate route-group cache-tag explanation.

### Operational notes

Apply migration `drizzle/migrations/0013_auth_cleanup_indexes.sql` through the normal migration
command before expecting the indexed cleanup plan in another environment. The four indexes
add storage and index maintenance on auth writes; no existing data or constraints are removed.
If application code is rolled back, these additive indexes remain compatible. Removing them
later requires a new reviewed migration; do not rewrite the recorded migration history.

Product-subtree invalidation deliberately favors prompt removal over cache-hit ratio after
moderation. It may regenerate other cached product/OG pages on subsequent visits. No Redis,
queue, scheduler, external search service, or persistent auth cache was introduced. Future
index and provider changes in the measure-first backlog remain deferred until their own
measurements justify the maintenance and infrastructure cost.

Reproduce instrumented counts by loading `scripts/performance-query-trace.mjs` with Node's
`--import` when starting a local production server. Set `PERF_QUERY_TRACE` to the same absolute
JSONL file in server and Playwright environments; run with one worker. The hook writes only
query classifications, never SQL, parameters or credentials. It is test tooling and is not
imported into application request paths. Without it, the instrumentation-only test explicitly
skips. Runtime measurements used Next 16.3.3, Node 24.14.1 and Chromium at 360px/1280px against
the confirmed development database. External OAuth/email/Turnstile services were not invoked.

- No live traffic, Core Web Vitals, deployed TTFB, compressed route bundle, Workers CPU,
  Neon query trace, or infrastructure bill was measured in this pass.
- Cleanup plans use a synthetic temporary table and one sample, not a production load test.
  Historical empty-description fixture timings are not representative content benchmarks.
- Request-scoped deduplication and next-request session revocation are verified on local Next;
  deployment adapter/Workers behavior remains NOT_VERIFIED.
- The newly wired invalidations in currently unused edit/state bindings were reviewed against
  actual generated tags. A complete live rename/category/status/publication/archive matrix
  remains NOT_VERIFIED because those bindings have no application UI/route callers today.
- Image slot correctness is verified; compressed image savings, DPR variants and field Core
  Web Vitals remain unmeasured.
- No code was pushed, merged or deployed. Indexes must be migrated in every deployment database
  before assuming the cleanup optimization is active there.

Each entry retains its original evidence, proposed approach and acceptance criteria alongside
the implementation update. Any remaining runtime limitation is recorded explicitly above.
