# FailProducts — AI Development Workflow

**Status:** Active
**Last reviewed:** 2026-08-31

How a task becomes a merged pull request. This document is the **process**.
[`AI-DEVELOPMENT.md`](./AI-DEVELOPMENT.md) is the **catalogue** of agents, skills, and MCP
servers. [`../AGENTS.md`](../AGENTS.md) is the **binding rule set**.

---

## 1. The loop

```
1. Understand   what is actually being asked, and what would make it wrong
2. Inspect      the repository, before forming any opinion
3. Plan         the smallest change that does the whole job
4. Implement    with the relevant skill open
5. Test         behaviour, not implementation
6. Review       with the agents this change class requires
7. Verify       the pre-push gate, and the judgement it cannot make
8. Document     in the same change, never in a follow-up
```

**Never jump from task to code.** Step 2 is the one most often skipped and the one that causes
the most rework: a duplicated utility, a rule reimplemented in the wrong layer, a decision
already settled in an ADR two years ago.

## 2. Inspect before you decide

Before writing anything, look at what exists. `AGENTS.md` §3 makes this binding, not advisory:
**if a fact is verifiable, verify it.**

```bash
ls src/domain src/services src/repositories src/components 2>/dev/null
grep -rn "<the concept you are about to add>" src/ 2>/dev/null
grep -rn "<the concept>" docs/
```

Check, in order:

| Look at | For |
|---|---|
| Existing code | The utility, component, or rule you are about to write again |
| Existing schema | The column or table that already models this |
| Existing tests | What behaviour is already pinned, and the fixtures you can reuse |
| `docs/DECISIONS.md` | Whether this was decided, and why |
| `docs/PRODUCT.md` §5.3 | Whether it is explicitly out of MVP |
| The doc for your area | The rule you are about to contradict |

Where documentation and implementation disagree, **report the discrepancy**. Prefer the
implementation for describing current state, the documentation for deciding intent, and change
neither silently.

If something cannot be verified, say so and label it `ASSUMPTION:` or `UNVERIFIED:`. If the work
would be unsafe or useless when that assumption is wrong — anything touching security,
authorization, personal data, retention, licensing, moderation, or infrastructure — **stop and
ask** instead of proceeding.

## 3. Change classification

Classify first. The classification selects the skills and the reviewers, and it keeps the
process proportionate: a typo fix does not get a security audit, and a schema change does not
skip one.

| Class | Trigger |
|---|---|
| `FEATURE` | New user-visible capability |
| `BUGFIX` | Restoring intended behaviour |
| `REFACTOR` | Structure changes, behaviour does not |
| `DATABASE` | Schema, migration, index, constraint, backfill |
| `UI` | Component, page, layout, styling, copy |
| `SECURITY` | Auth, authorization, validation, secrets, abuse |
| `PERFORMANCE` | Rendering, queries, caching, bundle |
| `INTEGRATION` | ZeptoMail, GitHub, R2, Turnstile, any external provider |
| `DOCUMENTATION` | Docs only |
| `RELEASE` | Promoting to production |

A change can carry more than one class. `scripts/verify-changes.sh` prints its own
classification from the diff — use it as a cross-check on yours, not as a replacement for
reading the change.

## 4. Agent routing

**Do not run every reviewer on every task.** A review everyone skims is worth nothing. Run the
ones the change class requires.

| Change class | Skills | Reviewers |
|---|---|---|
| `FEATURE` | `architecture`, `testing` | `architecture-reviewer`, `security-reviewer` |
| `BUGFIX` | `testing` | — (add the reviewer for the area it touches) |
| `REFACTOR` | `architecture` | `architecture-reviewer` |
| `DATABASE` | `database`, `architecture` | `architecture-reviewer`, `security-reviewer` |
| `UI` | `ui`, `performance` | `product-quality-reviewer`, `performance-reviewer` |
| `SECURITY` | `security`, `testing` | `security-reviewer` |
| `PERFORMANCE` | `performance` | `performance-reviewer` |
| `INTEGRATION` | `architecture`, `security` | `architecture-reviewer`, `security-reviewer`, `performance-reviewer` |
| `DOCUMENTATION` | — | — (`scope-skeptic` if it asserts a fact) |
| `RELEASE` | `release-check` | `release-verifier` |

Add regardless of class:

- **`scope-skeptic`** — before building anything new, and whenever the complexity gate fires
- **`dependency-gate` skill** — any change to `package.json` or the lockfile
- **`adr` skill** — any decision expensive to reverse
- **`pre-push-verify` skill** — before every push, without exception
- **`pre-merge-verify` skill** — before opening or merging a pull request

Then escalate by **impact radius**, which `scripts/verify-changes.sh` computes and prints:

| Radius | Add |
|---|---|
| `CROSS-FEATURE` | `impact-analyzer` |
| `SYSTEM` | `impact-analyzer`, `architecture-reviewer` |
| `PRODUCTION-CRITICAL` | `impact-analyzer`, `architecture-reviewer`, `security-reviewer`, `release-verifier` |

Radius is about reach, not size: two lines inside `src/lib/auth/` are `PRODUCTION-CRITICAL`.
Definitions in [`AI-VERIFICATION.md`](./AI-VERIFICATION.md#3-impact-radius).

**State what you did not run, and why.** A reviewer silently omitted is indistinguishable from
one forgotten, and only one of those is a decision.

Reviewers are advisory. Deterministic checks — the gate, CI, tests — are authoritative. The
maintainer is final.

## 5. Verification layers

```
                    Human review              ← authoritative, always final
                          │
   L3     Release verification                ← release-verifier, before production
                          │
   L2     Pre-merge verification              ← verification-orchestrator
          impact · reviewers · regressions       one PASS / PASS_WITH_WARNINGS / BLOCK
                          │
            ┌─────────────┴─────────────┐
            │                           │
      Agent reviews                Browser tests
   arch · security · perf · product   Playwright
            │                           │
            └─────────────┬─────────────┘
                          │
                    CI (.github/workflows/ci.yml)     ← authoritative, cannot be bypassed
                          │
              ┌───────────┼───────────┐
              │           │           │
            lint     typecheck      test
                          │
                        build
                          │
   L1             Pre-push gate                       ← scripts/verify-changes.sh
                  secrets · identity · branch · migrations · impact · contracts
```

Read it bottom-up: the cheapest, most deterministic checks run first and fail fastest.

The three levels answer different questions — *safe to leave the machine*, *safe to merge*, and
*ready to deploy*. Full definitions, decision rules, and the report format:
[`AI-VERIFICATION.md`](./AI-VERIFICATION.md). The lifecycle with worked examples:
[`AI-VERIFICATION-FLOW.md`](./AI-VERIFICATION-FLOW.md).

**AI review is advisory. Automated checks are authoritative where they are deterministic.
Human review is authoritative for production.**

## 6. The pre-push verification layer

The layer that answers *what did I change* and *is it safe to push*, before anything leaves the
machine. This repository is public and its history is permanent, so this is the cheapest place
to catch a leaked secret.

```bash
bash scripts/verify-changes.sh          # or: pwsh scripts/verify-changes.ps1
```

It runs automatically via `.githooks/pre-push`, installed by `scripts/setup-git-identity.sh`.
It blocks on: pushing to `main`, `.env` files, credential patterns, non-allowlisted email
addresses, missing DCO sign-off, AI attribution, wrong commit author, modified migrations, and
real identifiers in the public `.claude/` and `mcp/` directories.

The same script runs in CI, so a local bypass does not get past the pull request.

It also computes the **impact radius** and any **contract changes** — an exported symbol that
moved, a public route added or removed, an environment variable added, an API or database
contract changed. Those two outputs drive reviewer selection, so the routing decision is
computed rather than remembered.

Then do the part a script cannot: read the diff, confirm the docs still match, decide whether an
ADR is needed, and route the reviewers. That is the `pre-push-verify` skill.

Before the pull request, go one level up: `pre-merge-verify` runs impact analysis, the selected
reviewers, and the regression check, and issues a single `PASS` / `PASS_WITH_WARNINGS` / `BLOCK`
decision. See [`AI-VERIFICATION.md`](./AI-VERIFICATION.md).

`--no-verify` is a decision the maintainer makes and records in the PR — never a way to make a
push succeed.

## 7. Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every PR to `main`:

- **hygiene** — always. The verification gate, documentation link check, agent and skill
  frontmatter validation, MCP example JSON validation.
- **app** — `pnpm lint`, `typecheck`, `test`, `build`. Skipped while there is no `package.json`;
  the repository is pre-implementation and a fabricated green build would be worse than none.
- **e2e** — Playwright, once a config exists.
- **dependencies** — dependency review on pull requests, with a licence deny-list for
  AGPL-3.0-only distribution.

Integration tests that need a Neon branch do **not** run on pull requests. A credential does not
belong in a public repository's PR run: a `pull_request` job uses the base branch's workflow
file, so a PR cannot rewrite the job to read the secret — but it can rewrite a test file, and
test files run with whatever the job holds. A fork PR gets no secrets at all, so gating on the
event is also what keeps every PR's coverage identical rather than dependent on who opened it.

They **do** run on a push to `dev` and `main`. Both are protected and written by merge only, so
the code being run has already been reviewed and approved, and this is where the branch model
already expects verification to happen — `dev` is where a change is proved before it can be
promoted. The workflow reads `secrets.NEON_TEST_DATABASE_URL` (a Neon **development** branch,
never production — AGENTS.md §8), applies migrations, then runs `pnpm test` and `pnpm test:e2e`
with it, plus `pnpm test:integration` explicitly.

That last step is not redundant. `pnpm test` lets the integration suites skip themselves when
there is no database, which is correct on a PR and silently wrong when a credential is present
and something else made them skip. `pnpm test:integration` goes through
`scripts/require-database.mjs`, which exits non-zero rather than pass having run nothing.

**Until that secret exists, CI covers that the data-dependent code compiles and nothing about
what it does.** The suites report as *skipped*, never as passed. They also run locally and in
`release-check`.

The `Build` step is deliberately given an **empty** `DATABASE_URL` even when the secret is set.
The category and status pages are statically rendered (ADR-027), and a build that can reach a
database hides a page reading one at build time — a regression that shipped once and was caught
only by running the credential-free CI shape locally.

MCP servers are never required for CI. CI must pass for a contributor with no external accounts.

## 8. Complexity gate

Any of these requires a written justification **before** it is built:

new dependency · new service · new database · new queue · new cache · new abstraction layer ·
new architectural boundary · new external provider · new background process

```
COMPLEXITY JUSTIFICATION

Problem:
  What is broken or impossible today. Concretely, with the observation behind it.

Why existing architecture is insufficient:
  What was tried, or why it demonstrably cannot work.

Simpler alternatives:
  Each one considered, and why it was rejected. "None considered" is a rejection.

Why the proposed approach is justified:
  The evidence. A measurement, a limit hit, a requirement — not a prediction.

Operational cost:
  Money per month, and what breaks at 3am when it fails.

Maintenance impact:
  What one person now has to understand, patch, and migrate, forever.
```

**The default decision is: reject unnecessary complexity.**

Judge the justification on evidence, not eloquence. "We will need it when we scale" is not a
measurement. The `scope-skeptic` agent owns this judgement; `architecture-reviewer` flags a
missing justification as a FAIL.

The project is at **Stage 0** in [`ARCHITECTURE.md`](./ARCHITECTURE.md) §10. Stage 2
infrastructure — Redis, queues, search services, read replicas — requires a measurement proving
the need, and an ADR.

## 9. Scaling the right way

Do not equate *scalable* with *distributed*. The scaling strategy here is incremental, and the
fundamentals that actually matter cost nothing to get right early:

- indexes that match measured access patterns
- cursor pagination on every list, from the first commit
- bounded, efficient queries
- stable public URLs, with redirects when they change
- cacheable public pages
- server rendering
- clear domain boundaries
- isolated integrations
- efficient media storage

Each one is cheap now and expensive to retrofit. Every item on the complexity gate list is the
opposite: cheap to add and expensive to remove. That asymmetry is the whole argument.

## 10. When to stop and ask

Proceed under a stated assumption for ordinary judgement calls. **Stop and ask** when:

- the work touches security, authorization, personal data, retention, licensing, or moderation
  policy, and a fact you need cannot be verified
- two readings of the request produce materially different work
- the change would contradict an accepted ADR or a decision locked in `CLAUDE.md` §9
- proceeding on a wrong assumption would be unsafe, or would waste the work entirely

Asking costs one message. A wrong guess in these areas costs a migration, an incident, or a
retraction.
