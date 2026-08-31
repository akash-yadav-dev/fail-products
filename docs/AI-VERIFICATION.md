# FailProducts — Verification Reference

**Status:** Active
**Last reviewed:** 2026-08-31

The reference for how a change is verified: the levels, the impact radius, what gets selected,
how findings are rated, and how the final decision is made.

The **lifecycle with worked examples** is [`AI-VERIFICATION-FLOW.md`](./AI-VERIFICATION-FLOW.md).
The **process** for turning a task into a PR is [`AI-WORKFLOW.md`](./AI-WORKFLOW.md). The
**catalogue** of agents and skills is [`AI-DEVELOPMENT.md`](./AI-DEVELOPMENT.md).

---

## 1. What this system is for

To make mistakes harder to merge — not to make development harder.

The objective is deliberately modest:

> **Maximise confidence with the smallest practical verification process.**

Not "guarantee production safety". That claim cannot be honestly made by any pipeline, and a
system that overstates its coverage is worse than none, because it replaces caution with
confidence.

Three properties of this project set the design:

1. **It is public and its history is permanent.** A leaked credential is compromised the instant
   it is pushed. The cheapest place to catch it is before the push.
2. **It is maintained by one person.** Verification that costs more attention than it saves will
   be skipped, and a skipped process protects nothing. Proportionality is a requirement, not a
   nicety.
3. **It runs on metered infrastructure and hosts adversarial content.** Some mistakes cost money
   and some cost someone's reputation.

## 2. The three levels

Each level answers a different question. Running a heavier level than the change earns is a
failure mode, not diligence.

| Level | Question | Runs | Owner |
|---|---|---|---|
| **L1 pre-push** | Is it safe to leave the machine? | On every push, automatically | [`pre-push-verify`](../.claude/skills/pre-push-verify/SKILL.md) + `.githooks/pre-push` |
| **L2 pre-merge** | What could it break, and was that checked? | Before a PR is opened or merged | [`pre-merge-verify`](../.claude/skills/pre-merge-verify/SKILL.md) + [`verification-orchestrator`](../.claude/agents/verification-orchestrator.md) |
| **L3 pre-deploy** | Is the release ready for production? | Before promoting to production | [`release-check`](../.claude/skills/release-check/SKILL.md) + [`release-verifier`](../.claude/agents/release-verifier.md) |

L1 is fast and mechanical: secrets, identity, branch, migrations, and — once an application
exists — lint, typecheck, and tests. It must stay fast, because a slow pre-push hook gets
bypassed.

L2 is where impact analysis, reviewer selection, and regression checking happen.

L3 adds deployment configuration, rollback readiness, and the launch gate.

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs the L1 gate and the deterministic
half of L2 on every pull request, where a local `--no-verify` cannot reach it.

## 3. Impact radius

How far a change can reach. `scripts/verify-changes.sh` computes a first pass from paths and diff
content; [`impact-analyzer`](../.claude/agents/impact-analyzer.md) confirms or corrects it by
reading the change.

| Radius | Meaning | Typical triggers |
|---|---|---|
| `LOCAL` | One isolated implementation. Nothing outside depends on what moved | Docs, comments, a self-contained fix, tests only |
| `FEATURE` | One feature or domain; consumers stay inside that boundary | A single `src/domain/*` area, one route group |
| `CROSS-FEATURE` | Multiple domains, or shared code | `src/lib/`, `src/components/ui/`, `app/layout.tsx`, two or more domains |
| `SYSTEM` | Core architecture, data, build, or the verification system itself | `src/db/`, `src/lib/security/`, `package.json`, `next.config.*`, `tsconfig`, `AGENTS.md`, `CLAUDE.md`, `.githooks/`, `scripts/verify-changes.*` |
| `PRODUCTION-CRITICAL` | Could cause data loss, auth failure, outage, broken deploy, security hole, destructive migration, or major SEO damage | `drizzle/migrations/`, `src/lib/auth/`, `wrangler.*`, `.github/workflows/`, `.env.example` |

**Size is not radius.** A one-line change in `src/lib/auth/` is `PRODUCTION-CRITICAL`. A
thousand-line documentation rewrite is `LOCAL`.

Raise the radius whenever the diff justifies it. Lower it only with evidence — "the only two
consumers are in this diff" is evidence; "it looks small" is not.

## 4. Change classification

Classification selects the skills and reviewers.
[`AI-WORKFLOW.md`](./AI-WORKFLOW.md#3-change-classification) holds the table.

A change carries more than one class routinely: `src/app/products/[slug]/page.tsx` is `UI` and
`PERFORMANCE` and affects SEO. `package.json` is `DEPENDENCY` plus whatever runtime area it
touches.

The gate prints its own classification from the diff. Use it as a cross-check on yours, never as
a replacement for reading the change.

## 5. Selection

Route by class from [`AI-WORKFLOW.md`](./AI-WORKFLOW.md#4-agent-routing), then escalate by radius:

| Radius | Add |
|---|---|
| `CROSS-FEATURE` | `impact-analyzer` |
| `SYSTEM` | `impact-analyzer`, `architecture-reviewer` |
| `PRODUCTION-CRITICAL` | `impact-analyzer`, `architecture-reviewer`, `security-reviewer`, `release-verifier` |

Regardless of class or radius:

- `scope-skeptic` whenever anything on the [complexity gate](./AI-WORKFLOW.md#8-complexity-gate) list appears
- the `dependency-gate` skill on any change to `package.json` or the lockfile
- the `adr` skill on any decision expensive to reverse

**Non-selection is part of the output.** "Not run: `performance-reviewer` — no page, query, or
asset changed" is a decision. A reviewer silently omitted is indistinguishable from one
forgotten.

## 6. Three kinds of check

Their authority differs, and conflating them is how a pipeline starts lying.

### Deterministic — authoritative

Typecheck, lint, tests, build, migration validation, the verification gate, CI, secret scanning.
Same input, same verdict, every time. **These outrank every AI review.** A reviewer's approval
never clears a failing test.

### AI-assisted — evidence, not proof

Architecture, maintainability, security judgement, performance concerns, product consistency,
complexity. Genuinely useful and genuinely fallible. Treat as **review evidence**, and require
confidence and evidence on every finding (§7).

### External — facts the repository cannot supply

Cloudflare deployment state, Neon schema and query plans, GitHub CI status, real browser
behaviour. Used only where they settle something reading the repository cannot.

Permission model: read freely, write only with task intent, **never destructive without explicit
human authorization** — [`mcp/README.md`](../mcp/README.md) §2, ADR-024. MCP is never required
for CI; a contributor with no external accounts can run every deterministic check.

## 7. Severity, confidence, evidence

### Severity

| Severity | Meaning | Effect |
|---|---|---|
| `CRITICAL` | Auth bypass, RCE, secret exposure, database compromise, mass PII disclosure, data loss | Always blocks |
| `HIGH` | Stored XSS, IDOR, SSRF, privilege escalation, destructive migration, major regression | Blocks unless resolved or formally accepted |
| `MEDIUM` | Missing rate limit on an expensive path, enumeration, CSV injection, weak cookie flags | Blocks when caused by this change |
| `LOW` | Hardening, defence in depth, minor inefficiency | Warning |
| `INFO` | Observation | Informational |

### Confidence

Every AI-generated finding carries `HIGH`, `MEDIUM`, or `LOW`.

An uncertain hypothesis stated as a defect is the fastest way to make the maintainer stop reading
reports. Say what you are unsure about:

```
[MEDIUM] Possible N+1 query in the product feed
  Confidence: MEDIUM
  Evidence:   src/services/product-service.ts:88 loops over products calling
              productRepository.findTags() per row. Not measured — no data to profile against.
  Settle:     EXPLAIN against a seeded development branch, or a test asserting query count.
```

### Evidence

Every finding above `INFO` carries evidence: a file path and line, a command output, a test
result, an MCP result, a query plan, or an observed browser behaviour.

| Not acceptable | Acceptable |
|---|---|
| "This may be insecure." | "`src/app/api/preview/route.ts:24` passes the client-supplied `url` to `fetch()` with no host validation — SSRF." |
| "Performance could be better." | "The feed query has no `LIMIT`; at 20k products it returns every row." |
| "Consider adding tests." | "`generateSlug` changed behaviour and no test in `tests/` references it." |

A finding without evidence is a worry. Worries are fine in the `Unverified` section; they are not
findings.

## 8. Decision rules

Exactly one final state.

### `BLOCK`

- the verification gate exited non-zero
- lint, typecheck, tests, or build failed
- a `CRITICAL` finding exists
- a `HIGH` finding is unresolved and unaccepted
- a `MEDIUM` finding is directly caused by this change
- an unsafe or destructive migration exists without documented authorization
- broken production configuration
- a required reviewer returned `FAIL`
- a regression hypothesis is unresolved and *coverable* — writing the test is the fix
- a required check is `NOT_VERIFIED` and the radius is `SYSTEM` or `PRODUCTION-CRITICAL`

### `PASS_WITH_WARNINGS`

Nothing above holds, only `LOW` or `INFO` findings remain, and each carries a recorded decision.

### `PASS`

Required checks ran and passed, required reviewers returned `PASS`, no regression outstanding,
nothing material unverified.

### The `NOT_VERIFIED` rule

**A check that could not run is never `PASS`.**

Every check line is one of `PASS`, `WARN`, `FAIL`, `NOT_APPLICABLE`, `NOT_VERIFIED`. There is no
sixth state.

- `NOT_APPLICABLE` — the check does not apply to this change. A migration check on a docs edit.
- `NOT_VERIFIED` — the check applies but could not run. A missing tool, an unavailable
  environment, an absent credential.

Whether `NOT_VERIFIED` blocks depends on the radius:

```
Deployment verification unavailable.
  Status:   NOT_VERIFIED
  Radius:   PRODUCTION-CRITICAL
  Decision: BLOCK
```

```
Deployment verification unavailable.
  Status:   NOT_VERIFIED
  Radius:   LOCAL (documentation only)
  Decision: irrelevant to this change — proceed
```

While the repository is pre-implementation, `pnpm lint`, `typecheck`, `test`, and `build` are
`NOT_APPLICABLE — pre-implementation`. Reporting them as `PASS` would be a fabricated green
build, which is worse than no build at all.

## 9. Report format

```
FAILPRODUCTS VERIFICATION REPORT

Change:          <one line, read from the diff>
Branch / range:  <branch, or A..B>
Classification:  <UI | API | DATABASE | SECURITY | ...>
Impact radius:   LOCAL | FEATURE | CROSS-FEATURE | SYSTEM | PRODUCTION-CRITICAL
Risk level:      LOW | MEDIUM | HIGH | CRITICAL

Selected:
  Agents:  <run, and why>
  Skills:  <applied>
  Not run: <what, and why not>

Automated checks:
  Gate (verify-changes.sh):  PASS | WARN | FAIL
  Lint:                      PASS | FAIL | NOT_APPLICABLE
  Typecheck:                 PASS | FAIL | NOT_APPLICABLE
  Tests:                     PASS | FAIL | NOT_APPLICABLE
  Build:                     PASS | FAIL | NOT_APPLICABLE
  E2E:                       PASS | FAIL | NOT_APPLICABLE | NOT_VERIFIED
  Database:                  PASS | WARN | FAIL | NOT_APPLICABLE
  Security:                  PASS | WARN | FAIL
  Performance:               PASS | WARN | FAIL | NOT_APPLICABLE
  SEO:                       PASS | WARN | FAIL | NOT_APPLICABLE
  External (MCP):            PASS | WARN | FAIL | NOT_APPLICABLE | NOT_VERIFIED
  Regression analysis:       PASS | WARN | FAIL

Findings:
  [SEVERITY] <claim>
    Confidence: HIGH | MEDIUM | LOW
    Where:      path:line
    Evidence:   <what makes this true>
    Fix:        <the specific change>
    Reported by: <agent(s) — one line even when several found it>

Blockers:
  <the findings that force BLOCK, or "none">

Warnings:
  <LOW / INFO findings, each with the decision taken>

Rollback:
  EASY | MODERATE | DIFFICULT | UNKNOWN — <why>

Documentation:
  in sync | updated in this change | needs <file> updating

Unverified:
  <what was not checked, and what would settle it. "None" is valid>

Final decision: PASS | PASS_WITH_WARNINGS | BLOCK
  <one sentence of reasoning>
```

Scale the report to the change. A typo fix gets four lines and a decision, not this whole
skeleton.

## 10. Overrides and the four states

Only a human accepts risk. An agent never clears its own block.

These four are **not** equivalent, and collapsing them is how a verification record becomes
useless:

| State | Meaning |
|---|---|
| `Resolved` | The finding was fixed and the check re-run |
| `Accepted` | The maintainer decided to ship with it, on the record |
| `Ignored` | Nobody decided. This is a defect in the process |
| `Not verified` | Nobody checked |

An acceptance is recorded in the pull request:

```
Override
  Finding:       [HIGH] <what>
  Maintainer:    Akash Yadav
  Reason:        <why shipping is acceptable>
  Risk accepted: <what could happen, concretely>
  Date:          YYYY-MM-DD
  Revisit:       <the condition that reopens this>
```

`CRITICAL` findings are not overridable.

## 11. Rollback awareness

Any change at `SYSTEM` or `PRODUCTION-CRITICAL` radius reports how reversible it is:

| Rating | Meaning |
|---|---|
| `EASY` | Redeploy the previous version and it is undone |
| `MODERATE` | Reversible, but needs a coordinated step — a config change, a cache purge |
| `DIFFICULT` | A migration with data movement, a destructive change, an irreversible external effect |
| `UNKNOWN` | Not established — treat as `DIFFICULT` until it is |

Database migrations get special attention because redeploying does not undo them. The
expand → migrate → contract sequence in [`DEPLOYMENT.md`](./DEPLOYMENT.md) §9 exists so each
phase is individually reversible.

## 12. Post-deploy smoke verification

After a production deploy, verify only flows that exist in the current MVP:

```
homepage renders
product page renders, with correct metadata
sign-in works (email code, and GitHub OAuth)
product discovery — search, category, status filters
product submission end to end
outbound referral click records
```

Keep it small. A large production test suite built before the product exists is exactly the
premature infrastructure [`AGENTS.md`](../AGENTS.md) §6 rejects.

## 13. Known limitations

Stated plainly, because a verification system that hides its gaps is worse than one that does
not.

- **No application exists yet.** Import-graph impact analysis, regression detection, and browser
  verification have nothing to run against. They report `NOT_APPLICABLE — pre-implementation`
  and will become real when `src/` does.
- **Consumer detection is textual.** `grep` finds identifiers, not a resolved import graph. It
  will miss dynamic imports and re-exports, and it will produce false positives on common names.
- **AI review is not repeatable.** Two runs can differ. That is why deterministic checks are
  authoritative and reviewers are advisory.
- **Impact radius is heuristic.** Path-based rules are a proxy for reachability. They are
  deliberately biased towards over-classifying.
- **The gate cannot judge intent.** It proves a change is not obviously unsafe. It cannot tell
  whether it is correct, or whether it should exist.
- **MCP verification is point-in-time.** A deployment verified an hour ago may have changed.
  Record the date with the fact.

## 14. Running it yourself

Nothing here needs an AI tool or an external account.

```bash
bash scripts/verify-changes.sh                        # L1: what changed, is it safe
bash scripts/verify-changes.sh --staged               # staged only
bash scripts/verify-changes.sh --range origin/main..HEAD
pwsh scripts/verify-changes.ps1                       # Windows PowerShell
```

The same gate runs on `git push` via `.githooks/pre-push`, and again in CI where it cannot be
bypassed.
