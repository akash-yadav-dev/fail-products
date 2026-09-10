# Security, access control, and performance audit

Date: 2026-09-09. Status: **COMPLETE** for the scope below. Conducted sequentially, without
sub-agents.

Baseline: `9c4b6e8`, originally `fix/phase-3-audit-round-2`. Working branch:
`security/sequential-access-performance-audit`. This branch deliberately preserves ten unmerged
implementation commits ahead of `origin/dev`; review the audit delta against the baseline, not
against `dev` alone.

This audit ran in two passes. The first was interrupted part-way and left corrections in the
working tree that its own report still described as pending. The second pass reconstructed those
corrections from the diff, verified each against the tests and the specification, fixed four
regressions the first pass had introduced, and completed the remaining scope. §4 records the
regressions, because an audit that quietly repairs its own damage teaches nothing.

## 1. Scope and progress

- [x] Read repository governance, architecture, engineering rules, and security specification.
- [x] Authentication, sessions, OAuth, and logout.
- [x] Every Server Action and API route; owner, anonymous, and moderator permissions.
- [x] Public/private data selection, input validation, XSS, URLs, and abuse controls.
- [x] Query bounds, rendering, caching, and external request cost.
- [x] Reproduce findings, implement corrections, add regression tests.
- [x] Run verification and record final limitations.

## 2. Security findings

All are fixed unless stated. Severity is this audit's own judgement.

### Authentication and sessions

**S01 — HIGH — A one-time code was not bound to the address it was sent to.**
`services/auth/auth-service.ts` hashed the bare six-digit code, so the hash of `314159` was the
same row shape for every account. Now hashed as `${email}:${code}`. Regression test:
`audit-regressions.test.ts`, "allows the same six-digit code for different email addresses".

**S02 — HIGH — Only the newest live code was attempt-limited.**
`incrementTokenAttempt` took a token id and the caller passed `active[0].id`, so an attacker who
requested a second code reset the effective attempt budget on the first. It now takes the email
and increments every live token for it. Test: "locks older active codes as well as the newest
after five wrong guesses".

**S03 — MEDIUM — A GitHub identity with no public email could not be created.**
`createUser` did not return the inserted id, and the fallback re-read was by email — which is
null for exactly the accounts that needed it. Now returns the id. `displayName` is also capped at
80 characters, which was previously unbounded attacker-supplied text. Test: "signs in a GitHub
identity without email and reuses the linked account".

**S04 — MEDIUM — The OAuth callback's cookie parser matched on a suffix.**
`new RegExp(`${name}=([^;]+)`)` matches `oauth_state=` when asked for `state`, and interpolates
an unescaped name into a pattern. Replaced with an exact split-and-prefix match.

**S05 — LOW — The OAuth callback spent its rate limit before validating anything.**
The limit was consumed before the state cookie was compared, so unauthenticated noise could
exhaust the allowance for real callbacks. It now runs after the CSRF check.

### Authorization and data exposure

**S06 — HIGH — Report targets were not filtered, making the report form an existence oracle.**
`findReportableProduct` and `findReportableComment` answered for any id, including listings that
were never published. Posting an id to the report form and reading whether it was accepted
enumerated other people's unpublished drafts and returned their slugs.

Fixed with `publishedProduct` — a **new, deliberately weaker** predicate than
`publiclyVisibleProduct`, added to `db/queries/product-visibility.ts`. The distinction is
publication, not moderation, and it is the whole finding:

- never published → not reportable. It was never public; answering confirms it exists.
- published, then hidden or removed → **still reportable**. It was public, and this is precisely
  what an appeal or a privacy request under `docs/MODERATION.md` §10 is filed against. Those
  arrive *after* the takedown.

The first pass collapsed these two into one filter and broke the appeal path; see §4, R01.
Tests: `audit-regressions.test.ts`, "refuses to confirm an unpublished draft exists, but keeps a
takedown reportable", and two cases in `moderation.test.ts`.

**S07 — MEDIUM — A retired slug redirected even for a listing that was never public.**
`findByRetiredSlug` was unfiltered, so the old URL of an unpublished draft answered "moved, and
here is the new slug" — an enumeration oracle built out of a redirect, for a page that then 404s
anyway. Now filtered on `publiclyVisibleProduct`: the redirect ADR-019 protects is the one
inbound links and crawlers follow, and both only ever saw a published listing. Test:
`product-service.test.ts`, "does not redirect a retired slug belonging to an unpublished draft".

**S08 — MEDIUM — Two Server Actions ran a Turnstile verification before checking sign-in.**
`postCommentAction` and `reportAction` let an anonymous caller spend a siteverify round trip.
They now return early.

**S09 — LOW — A resolved report could be returned as the live duplicate.**
The unique indexes on `reports` are partial on `status = 'OPEN'`, but the conflict-path re-read
was not, so it could return an older resolved row's id. Now filtered to match the index.

**S10 — LOW — `reportId` was accepted without checking it referred to the target.**
A moderator action could attach an unrelated report id to an audit row. Now verified against the
comment or product being moderated.

### Abuse controls

**S11 — HIGH — Product submission had no enforced rate limit.**
`RATE_LIMITS.productSubmit` did not exist. Every request could create a draft carrying up to
20,000 description characters plus two status-history rows, unbounded, on metered storage. Now
five per hour per account, on the counted layer. Test: "blocks a submission at the configured
limit without writing a draft".

**S12 — MEDIUM — Profile updates and moderation writes had no rate limit.**
Added `profileUpdate` (20 / 10 min) and `moderationWrite` (60 / 10 min). Neither is a cost
control; the reasoning for each is in `rate-limit.ts` and `docs/SECURITY.md` §11.

**S13 — MEDIUM — No external request had a timeout.**
Turnstile siteverify, both GitHub OAuth calls, and ZeptoMail could hang for the platform default.
Each now carries `AbortSignal.timeout(10_000)`. Turnstile sits in front of every write it guards,
so a Cloudflare stall must fail the check rather than hold the request open.

**S14 — MEDIUM — Turnstile parsed its response outside the `try`.**
A truncated or non-JSON body escaped as an unhandled rejection rather than a failed check. Parsing
moved inside, with a shape check and a 2,048-character cap on the submitted token.

**S15 — MEDIUM — Moderation was three sequential writes with no transaction.**
State, audit row, and report resolution could each fail independently, and the recovery comment in
the source acknowledged it. All three are now one data-modifying CTE per action
(`applyCommentModeration`, `applyProductModeration`): a stale transition or a failed audit insert
leaves all three unchanged. Tests: "rolls back a moderation state change when its audit insert
fails" and "allows only one competing moderation transition and records it once".

### Checked and found sound

- The E2E auth bypass (`/api/auth/test-session`) is double-gated on `E2E_AUTH_BYPASS=1` **and** a
  `http://localhost:` site URL, and grants navigation only — never the moderator role. It cannot
  activate in a deployed environment.
- Every Server Action derives identity from the session, never from a form field. `tests/e2e/
  access-control.spec.ts` posts forged `userId`, `ownerId`, `role`, and `isModerator` fields and
  asserts they change nothing.
- Every repository read is bounded by a `LIMIT`. The three unbounded statements are `COUNT`
  aggregates.
- Turnstile's absence on the submit form is per specification: `docs/SECURITY.md` §11 scopes it to
  comment posting and reporting, and each widget declares an action name re-checked at
  verification, so a token cannot be replayed across forms.

## 3. Performance findings

**P01 — HIGH — Directory cards selected the full description column.**
`listColumns` spread `publicColumns`, so every card query returned `description` — capped at
20,000 characters by `docs/PRODUCT.md` — plus `website_url`, `logo_key`, and `created_at`. A card
renders none of them. `docs/DEPLOYMENT.md` §11 names Neon egress as the budget that runs out
first, and this is the highest-traffic query in the product.

The columns are now listed explicitly rather than subtracted, so adding one to `publicColumns`
cannot silently put it back.

Measured on one 48-card page. The development branch holds 128 fixture listings with **no
description text at all**, so the saving could not be measured against real data and was modelled
instead — bytes of query result, by mean description length:

| mean description | with description | without | saved |
|---|---|---|---|
| 0 | 21.6 KB | 13.3 KB | 38.5% |
| 500 | 45.1 KB | 13.3 KB | 70.5% |
| 2,000 | 115.4 KB | 13.3 KB | 88.5% |
| 8,000 | 396.6 KB | 13.3 KB | 96.6% |
| 20,000 (the cap) | 959.1 KB | 13.3 KB | 98.6% |

Postgres execution time is unchanged (~0.16 ms either way at this row count); the cost is transfer
and deserialisation, not planning. Test: "does not return full descriptions in directory cards".

**P02 — MEDIUM — Every auth request paid for two unbounded global DELETEs.**
`cleanupAuthData` ran *before* the rate limit check, so an already-blocked attacker still triggered
a full sweep of `auth_tokens` and `sessions` on every syntactically valid request. It now runs
after the limit, deletes at most 100 rows per table, and issues both statements in one `db.batch`
round trip.

**P03 — MEDIUM — The owner dashboard's moderation lookup was unbounded.**
`latestModerationByOwner` scanned every listing an owner has ever created while the list beside it
showed 50. Now restricted to the same 50 rows.

**P04 — LOW — `listByOwner` had no deterministic tiebreak.**
Ordered by `updated_at` alone, two listings updated in the same moment could swap places between
renders. Now `(updated_at DESC, id DESC)`.

### Checked and found sound

- `/products` is the only dynamic public list, and deliberately so (ADR-027): it is the one route
  that takes a sort, a cursor, and a search term. `/categories/[slug]` and `/status/[slug]` are
  SSG with a 5-minute revalidate. This is a documented decision and was left alone.
- `generateStaticParams` for `/products/[slug]` is capped at 1,000, so build time cannot grow
  without bound.
- 28 client components, all genuinely interactive. Cards and lists are server components.
- No N+1: the category on a card comes from a join.

## 4. Regressions introduced by the interrupted first pass

Recorded rather than quietly repaired. Every one was a correct instinct applied too widely.

**R01 — The appeal path was broken.** S06's filter was applied as `publiclyVisibleProduct`, which
excludes hidden and removed content — so a takedown became unreportable, which is the one case an
appeal is always about. It broke two existing tests whose comments state the rule explicitly ("a
queue filtered by public visibility would drop exactly the reports an appeal is about"), and the
first pass then added a *third* test asserting the new, wrong behaviour rather than reconciling
with them. Fixed by splitting the predicate (S06); the contradictory test was replaced with one
pinning both halves of the boundary.

**R02 — Two `revalidatePath` calls named route groups.** `revalidatePath("/(site)/u/[username]",
"page")` and `revalidatePath("/(site)/products", "layout")`. Next strips route groups when it
derives implicit cache tags (`normalizeAppPath`: "Groups are ignored"), so neither tag can ever
match and both calls were silent no-ops. The first also *replaced* a working `/u/[username]` call,
so editing a profile stopped refreshing the public profile page. Both now use the URL path.

**Correction, 2026-09-10.** The paragraph above is wrong about this build, and it is left
standing only so the mistake is not repeated. Next 16.3.3 does *not* strip the route group:
`implicit-tags.js` derives the tag from the unnormalized page path, and every generated
`.meta` file under `.next/server/app/products/` — the share-image routes included — carries
`_N_T_/(site)/products/layout`. A `revalidatePath("/products", "layout")` call therefore
matches nothing, which is the opposite of what R02 concluded. Product subtree invalidation
now uses `/(site)/products`, checked against the built tags rather than against
`normalizeAppPath`, and covered by a warm-cache moderation regression in
`tests/e2e/performance-regressions.spec.ts`. The literal `/products/<slug>`,
`/categories/<slug>` and `/status/<slug>` calls address real URLs rather than tags and were
always valid; they are unchanged. R02's other call, `revalidatePath("/u/[username]", "page")`
in the settings action, is left alone deliberately: `/u/[username]` appears in neither the
prerender manifest nor the built `.meta` set, so it is rendered on every request and no form
of that call invalidates anything. It is a no-op under either reading, not a fix to reverse
without first giving the profile page a cache to invalidate.

**R03 — Unreachable branch left in `verifyTurnstileToken`.** The `!response.ok` check was moved
inside the `try` but not removed from after it.

**R04 — Three repository methods left orphaned.** `resolveOpenForTarget`, `recordCommentAction`,
and `CommentRepository.setModerationState` lost their callers to S15. Leaving them is the real
hazard: each is the unconditional half of an operation that is now atomic, so a future caller
could change a state and lose the audit row to the next failure — exactly what S15 fixed. Removed,
with the reasoning recorded inline per this repository's existing convention.

**R05 — Undocumented rate limit rules.** The three new rules shipped without the rationale every
other rule in that file carries, and `docs/SECURITY.md` §11 still listed product submission as
using the Workers `ratelimit` binding. CLAUDE.md §5 requires the doc to change in the same PR.
Both now record the numbers and why.

## 5. Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | pass |
| `eslint` | pass, 0 warnings |
| `vitest --project unit` | 467 passed / 26 files |
| `vitest --project integration` | 151 passed / 11 files |
| `next build` | pass, 297 static pages |
| `scripts/verify-changes.sh` | PASS_WITH_WARNINGS (1) |

The gate's single warning — "schema changed but no migration added" — is a false positive. It
classifies on the `src/db/` path prefix; the only file changed under it is
`db/queries/product-visibility.ts`, a query predicate. No table definition changed, confirmed by
an empty `git diff` over `src/db/schema/`. No migration is needed.

## 6. Limitations

Explicitly **not** established by this audit:

- No production deployment exists, so nothing here is verified against production configuration,
  a real Cloudflare Turnstile key, real GitHub OAuth, or real ZeptoMail delivery. Every external
  integration was exercised against a test double.
- The development database holds 128 fixture listings with empty descriptions. P01's saving is
  modelled, not observed; query plans at real cardinality are unknown, and no index decision in
  §3 rests on a production plan.
- Playwright E2E was not executed in this pass — `tests/e2e/access-control.spec.ts` is committed
  and unrun here. It needs a running server and an isolated Neon branch.
- Rate limit windows are chosen from reasoning about the product, not from observed abuse. They
  are a starting position to be revised against real traffic.
- No claim of security completeness is made. This audit found and fixed what it names; it did not
  prove the absence of anything else.
