---
name: testing
description: Decide what to test and write the test. Use when adding a feature, fixing a bug, changing a domain rule, touching a repository or migration, or adding a user-facing flow. Covers unit, integration, and Playwright E2E, fixtures, mocking external services, and test organisation. Emphasises testing behaviour over implementation.
---

# Testing

## Purpose

Make behaviour verifiable and keep it verified as the project changes — without building a test
suite that costs more to maintain than the code it covers.

The governing principle: **test behaviour, not implementation.** A test that breaks when a
function is renamed, though nothing changed for a user, is a maintenance cost with no benefit.
A test that survives a refactor and catches a real regression is the whole point.

## When to use it

- Adding any feature
- Fixing any bug — the regression test is part of the fix, not a follow-up
- Changing a domain rule, a permission, or a state transition
- Touching a repository, a constraint, or a migration
- Adding or changing a user-facing flow

## Context you need first

- `docs/ENGINEERING.md` §10 — what gets unit, integration, and E2E coverage
- `docs/PRODUCT.md` §13 — the acceptance criteria the E2E suite ultimately proves
- `docs/CODE-STRUCTURE.md` — `tests/unit`, `tests/integration`, `tests/e2e`
- The existing tests. Read them before adding one:

```bash
ls tests/unit tests/integration tests/e2e 2>/dev/null
grep -rn "<the behaviour you are about to test>" tests/ 2>/dev/null
```

Never assume coverage exists, and never assume it does not.

## What to test at which level

### Unit — `tests/unit/`

Pure domain logic, no I/O. Fast, and the majority of the suite.

Per `docs/ENGINEERING.md` §10: status transitions, permissions, validation, referral
attribution, moderation rules, slug generation.

These are the rules that must hold regardless of database, framework, or provider — which is
exactly why `domain/` is dependency-free. If a unit test needs a mock of Drizzle or Next.js,
the code under test is in the wrong layer. Fix the placement, not the test.

### Integration — `tests/integration/`

Real database, against a **Neon development branch**. Never production, never a shared branch
another run could be using.

Covers: repository queries, database constraints actually firing, service behaviour end to end,
email dispatch adapters, cursor pagination correctness across page boundaries, and migrations
applying cleanly to a branch seeded with realistic data.

Constraints deserve their own tests. A `UNIQUE` or `ON DELETE` policy is a guarantee; assert it
rejects what it should, rather than trusting the declaration.

### E2E — `tests/e2e/`, Playwright

Real browser, real flows. Expensive, so keep the set small and high-value.

Minimum coverage from `docs/ENGINEERING.md` §10:

```
registration → product creation → publication → comment
→ waitlist signup → referral click → moderation/report flow
```

Also verify, because they are invisible to unit tests and matter to this product specifically:

- public product pages render meaningful content **with JavaScript disabled** (`docs/PRODUCT.md` §9)
- keyboard navigation and visible focus through a full form
- a retired slug redirects to the canonical URL (ADR-019)

## Rules

**Name the behaviour, not the function.**

```
Bad:   test("createProduct")
Good:  test("rejects a slug that collides with a reserved route")
```

A failing test name should tell you what broke without opening the file.

**Arrange, act, assert.** One behaviour per test. A test asserting six things fails once and
hides five.

**Test through the public surface.** Call the service or the domain function a real caller would
call. Reaching into internals couples the test to the shape of the code, which is the coupling
this skill exists to avoid.

**Cover the boundaries, not just the happy path.** Empty, one, many. Null and absent — they are
different. Maximum length. Wrong owner. Wrong state. Concurrent double-submit.

**Every bug fix ships with the test that would have caught it.** Write it first, watch it fail,
then fix. A regression test that never failed proves nothing.

**Deterministic or it does not merge.** No real clock, no real randomness, no dependence on test
order or on rows another test created. Inject time and randomness — the same discipline that
makes tokens secure makes them testable.

**Never weaken a test to make it pass.** If a security test is inconvenient, the code is wrong.

## Fixtures and external services

**Fixtures are factories with sensible defaults**, overridable per test. A test should state only
the fields it actually cares about; anything else is noise that hides the point.

Seed the minimum. A fixture that creates a whole object graph makes every test slow and every
failure ambiguous.

**Mock at the adapter boundary, never deeper.** This is what `integrations/` is for:

| Service | In tests |
|---|---|
| ZeptoMail | Fake adapter that records messages. Assert on what was sent, never send |
| GitHub API | Fixture responses at the integration boundary |
| Cloudflare R2 | In-memory or local stub; assert the key shape and content type |
| Turnstile | Stubbed verifier — but keep at least one test asserting failure is handled |
| Neon | **Not mocked.** Integration tests use a real development branch |

Never mock the thing you are testing. Mocking a repository to test a repository tests the mock.

**Preview and test environments must not reach real recipients or production data.** This is a
release-check item (`release-check` §7) and a test-design rule.

## Organisation

```
tests/
  unit/           mirrors src/domain/ and src/lib/
  integration/    mirrors src/repositories/ and src/services/
  e2e/            named by flow, not by page
  fixtures/       factories, shared seed data
```

Mirror the source tree so a contributor can find the test for a file without searching. E2E
files are named for the journey (`product-submission.spec.ts`), because that is how they fail.

## Common mistakes

- Asserting on implementation details — call counts, private state, internal ordering.
- One giant E2E test covering six flows; when it fails, nobody knows which broke.
- Mocking the database in a repository test.
- Snapshot tests over rendered markup, which fail on every cosmetic change and get regenerated
  without being read.
- Tests that share mutable state and pass only in the order they were written.
- Testing a getter. Coverage percentage is not the goal; caught regressions are.
- Skipping the regression test because the fix "is obvious".
- Writing an E2E test for something a unit test proves faster and more precisely.

## Verification expectations

- Watch every new test **fail first**. A test that has never failed has not been verified.
- Run the full suite before opening the PR, not just the file you touched.
- Integration tests ran against a development branch, and you can say which.
- If a check could not run — no implementation yet, no database branch available — report it as
  **skipped**, with the reason. Never report a skipped test as passing (`AGENTS.md` §10).

## Exit criteria

```
[ ] new domain rules have unit tests
[ ] new repository queries and constraints have integration tests
[ ] a flow in the docs/ENGINEERING.md §10 list has an E2E test
[ ] every bug fix has a regression test that failed before the fix
[ ] boundary cases covered: empty, one, many, wrong owner, wrong state
[ ] no test asserts on implementation detail
[ ] external services mocked at the adapter boundary only
[ ] tests are deterministic and order-independent
[ ] the full suite passes locally, and the result is stated honestly
```

Feeds into the `release-verifier` agent, which re-runs these independently rather than trusting
this checklist — [`docs/AI-WORKFLOW.md`](../../../docs/AI-WORKFLOW.md#4-agent-routing).
