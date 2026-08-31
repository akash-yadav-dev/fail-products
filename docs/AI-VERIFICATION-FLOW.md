# FailProducts — Verification Flow

**Status:** Active
**Last reviewed:** 2026-08-31

The lifecycle of a change through verification, with worked examples at four risk levels.

The **rules** — radius definitions, severity ladder, decision logic, report format — live in
[`AI-VERIFICATION.md`](./AI-VERIFICATION.md). This document shows them being applied.

---

## 1. The pipeline

```
                          CHANGE
                             │
                             ▼
                       UNDERSTAND            read the diff, never the intent
                             │
                             ▼
                        CLASSIFY             UI · API · DATABASE · SECURITY · ...
                             │
                             ▼
                    IMPACT ANALYSIS          direct · indirect · contracts · regressions
                             │
                             ▼
                     IMPACT RADIUS           LOCAL → PRODUCTION-CRITICAL
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
         SELECT AGENTS             SELECT CHECKS         by class, escalated by radius
                │                         │
                └────────────┬────────────┘
                             ▼
                  DETERMINISTIC CHECKS      authoritative — gate, lint, types, tests, build
                             │
                             ▼
                   TARGETED REVIEWS         advisory — the reviewers this class earns
                             │
                             ▼
                 EXTERNAL VERIFICATION      only where it settles something (MCP)
                             │
                             ▼
                  REGRESSION CHECKS         each hypothesis: covered · coverable · human
                             │
                             ▼
                     AGGREGATE              dedupe by root cause, order by consequence
                             │
                             ▼
                      DECISION
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
      PASS         PASS_WITH_WARNINGS           BLOCK
        │                    │                    │
        ▼                    ▼                    ▼
     merge          merge, warnings          fix → re-run
                     recorded in PR          affected checks only
                                                  │
                                                  └──────► back to DETERMINISTIC CHECKS
```

Read it top-down for order, and note the one rule that governs the shape: **the cheapest,
most deterministic checks run first, so the expensive ones only run on changes that earned them.**

## 2. Where each level sits

```
   L1 pre-push  ──────  git push          fast, mechanical, automatic, cannot be slow
        │                                 pre-push-verify + .githooks/pre-push
        ▼
   L2 pre-merge ──────  pull request      impact, reviewers, regressions
        │                                 pre-merge-verify + verification-orchestrator
        ▼
   L3 pre-deploy ─────  production        config, rollback, smoke
                                          release-check + release-verifier
```

CI runs L1 and the deterministic half of L2 on every PR, where a local `--no-verify` cannot
reach it.

## 3. Worked example — LOW risk

**Change:** fix a typo in the homepage hero copy.

```bash
$ bash scripts/verify-changes.sh
Classification: UI
Impact radius: FEATURE
PASS — no findings
Reviewers to run: performance-reviewer product-quality-reviewer
```

The gate routes by class. Judgement applies proportionality: a copy fix does not move rendering
or query cost, so `performance-reviewer` is not run — and that non-selection is stated.

```
FAILPRODUCTS VERIFICATION REPORT

Change:          Fix "recieve" → "receive" in the homepage hero
Classification:  UI
Impact radius:   FEATURE
Risk level:      LOW

Selected:
  Agents:  product-quality-reviewer — user-visible copy
  Not run: performance-reviewer — no rendering, query, or asset change
           impact-analyzer — radius below CROSS-FEATURE, no contract moved

Automated checks:
  Gate: PASS · Lint/Typecheck/Tests/Build: NOT_APPLICABLE — pre-implementation

Findings: none
Rollback: EASY — redeploy the previous version
Documentation: unaffected
Unverified: none

Final decision: PASS
```

**The point:** four reviewers were available and one ran. That is the system working.

## 4. Worked example — MEDIUM risk

**Change:** add the product submission form.

```bash
$ bash scripts/verify-changes.sh
Classification: UI SECURITY FEATURE
Impact radius: FEATURE
Contract changes:
  - API route(s) changed — check every consumer of the response shape
PASS_WITH_WARNINGS — 1 warning
```

A contract moved, so `impact-analyzer` runs even though the radius is only `FEATURE`.

```
Selected:
  Agents:  impact-analyzer      — contract change reported by the gate
           architecture-reviewer — new feature slice across layers
           security-reviewer     — new mutation, new user input
           product-quality-reviewer — user-facing flow
  Skills:  architecture, security, testing, ui
  Not run: performance-reviewer — no list query or public page rendering added

Regression hypotheses:
1. Existing draft products fail validation under the new schema
   Settle:  integration test against a seeded development branch
   State:   coverable — test written in this change

Findings:
  [MEDIUM] Submission endpoint has no rate limit
    Confidence: HIGH
    Where:      src/app/api/products/route.ts:31
    Evidence:   docs/SECURITY.md §11 requires a limit on product submission;
                no ratelimit binding or DB counter is called on this path
    Fix:        add the per-user ratelimit binding check before the domain call
    Reported by: security-reviewer, architecture-reviewer (one finding, two witnesses)

Final decision: BLOCK
  MEDIUM finding directly caused by this change (AI-VERIFICATION.md §8).
```

**The point:** two reviewers found the same problem and it is reported once. And a `MEDIUM`
caused by the change blocks — it is cheaper to add the limit now than after a scraper finds it.

## 5. Worked example — HIGH risk

**Change:** switch session cookies from `SameSite=Lax` to `SameSite=Strict`.

```bash
$ bash scripts/verify-changes.sh
Classification: SECURITY
Impact radius: PRODUCTION-CRITICAL     # src/lib/auth/
Reviewers to run: architecture-reviewer impact-analyzer release-verifier security-reviewer
```

Two changed lines. `PRODUCTION-CRITICAL` anyway — radius follows reach, not size.

```
Impact dimensions:
  User:      every signed-in session; magic-link sign-in arrives via an email
             client, which is a cross-site navigation
  Security:  intended improvement — CSRF surface narrows
  Data:      none
  Deployment: none

Regression hypotheses:
1. Magic-link sign-in breaks — the link is followed from an external context,
   so a Strict cookie is not sent on the landing request
   Settle:  Playwright E2E, sign-in via emailed link
   State:   not automatically verifiable yet — no E2E suite exists

Automated checks:
  E2E: NOT_VERIFIED — no Playwright config exists

Final decision: BLOCK
  A PRODUCTION-CRITICAL change with a required check NOT_VERIFIED (§8).
  The hypothesis is the known Strict-cookie failure mode for emailed links,
  and it is exactly what this change would break in production.
```

**The point:** nothing failed. A check *could not run*, and at this radius that is a block —
not a green report with a footnote. This is the `NOT_VERIFIED` rule doing the work it exists
for.

## 6. Worked example — CRITICAL risk

**Change:** a migration renaming `products.status` to `products.failure_status`.

```bash
$ bash scripts/verify-changes.sh
Impact radius: PRODUCTION-CRITICAL
BLOCK — 1 blocking finding
  BLOCK  existing migration file(s) modified — applied migrations are immutable, fix forward
  WARN   destructive SQL in the diff — confirm expand/migrate/contract
```

The gate blocks before any reviewer runs. Deterministic checks are authoritative, and this one
is unarguable.

Had it been a *new* migration, the pipeline would continue:

```
Contract changes:
  - database contract changed — check every query against the affected tables

Impact analysis:
  Consumers of `products.status`: 7 files
    src/repositories/product-repository.ts:44,71,102
    src/services/product-service.ts:33
    src/app/status/[slug]/page.tsx:18
    tests/integration/product-repository.test.ts:56,91

Findings:
  [CRITICAL] Migration renames a column in one step
    Confidence: HIGH
    Where:      drizzle/migrations/0007_rename_status.sql:3
    Evidence:   ALTER TABLE ... RENAME COLUMN with no expand phase. Deployed code
                reading `status` breaks the moment the migration applies; this is
                the window docs/DEPLOYMENT.md §9 exists to eliminate.
    Fix:        expand (add column, dual-write) → migrate (backfill) → contract (drop)

Rollback: DIFFICULT — a rename is not undone by redeploying

Final decision: BLOCK
```

**The point:** the reason this is `CRITICAL` is not the SQL. It is that redeploying does not
undo it — see [`AI-VERIFICATION.md`](./AI-VERIFICATION.md) §11.

## 7. The fix loop

```
BLOCK
  │
  ▼
Fix — the smallest change that resolves the finding.
  │     A MEDIUM finding does not license rewriting the module.
  ▼
Re-run the check that caught it.
  │     Not the whole pipeline. Not "it looks right now".
  ▼
Re-review only what the fix touched.
  │
  ▼
PASS ──► merge
```

The most common way this loop fails is skipping the re-run because the fix is obviously correct.
Re-running the failed check is the cheapest evidence available.

## 8. Choosing the effort

| Change | Gate | Impact analysis | Reviewers | E2E |
|---|---|---|---|---|
| Copy edit | ✅ | — | product-quality | — |
| Docs | ✅ | — | — (scope-skeptic if it asserts a fact) | — |
| Bug fix, one file | ✅ | — | the area's reviewer | — |
| New feature slice | ✅ | if a contract moved | architecture, security | affected flow |
| Shared component | ✅ | ✅ | architecture, product-quality, performance | affected flows |
| Dependency added | ✅ | — | scope-skeptic, security + `dependency-gate` | — |
| Schema / migration | ✅ | ✅ | architecture, security, release-verifier | affected flows |
| Auth change | ✅ | ✅ | all reviewers | sign-in, end to end |
| Production deploy | ✅ | ✅ | release-verifier + L3 | smoke suite |

## 9. What this pipeline does not tell you

- That production is safe. It tells you the change passed the checks that ran.
- That the change is correct. Deterministic checks prove it is not obviously broken.
- That the change should exist. That is `scope-skeptic`, and it runs before the work, not after.
- That every consumer was found. Consumer detection is textual — see
  [`AI-VERIFICATION.md`](./AI-VERIFICATION.md) §13.

The maintainer is the final reviewer. This system exists to make sure that by the time a change
reaches them, the mechanical questions are already answered and their attention is spent on the
ones that need judgement.
