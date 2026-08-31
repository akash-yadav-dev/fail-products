---
name: pre-merge-verify
description: Verify that a change is safe to merge, not just safe to push. Use before opening a pull request, before merging one, and whenever asked "is this ready to merge" or "what could this break". Runs the full pipeline — impact analysis, selected reviewers, regression checks — and produces one auditable decision. The heavier sibling of pre-push-verify.
---

# Pre-merge verification

## Purpose

`pre-push-verify` answers *is this safe to leave my machine*. This answers a harder question:

> **What could this break, and has that been checked?**

The difference matters because the two failure modes are different. A push leaks a secret. A
merge breaks a caller nobody looked at, in a file the diff never mentions.

Full reference — radius definitions, severity ladder, decision rules, report format:
[`docs/AI-VERIFICATION.md`](../../../docs/AI-VERIFICATION.md).

## When to use it

- Before opening a pull request
- Before merging one
- When asked "is this ready", "is this safe to merge", or "what could this break"
- After a fix, to re-verify what the fix touched
- Before a release — then continue into [`release-check`](../release-check/SKILL.md)

**Not** for every commit. This is the pre-merge level; the fast local gate is
[`pre-push-verify`](../pre-push-verify/SKILL.md).

## The three levels

Each answers a different question. Do not run a heavier level than the change earns.

| Level | Question | Owner |
|---|---|---|
| **L1 pre-push** | Is it safe to leave the machine? | [`pre-push-verify`](../pre-push-verify/SKILL.md) + `.githooks/pre-push` |
| **L2 pre-merge** | What could it break, and was that checked? | this skill + `verification-orchestrator` |
| **L3 pre-deploy** | Is the release ready for production? | [`release-check`](../release-check/SKILL.md) + `release-verifier` |

## Context needed

- [`docs/AI-VERIFICATION.md`](../../../docs/AI-VERIFICATION.md) — the pipeline and its rules
- [`docs/AI-WORKFLOW.md`](../../../docs/AI-WORKFLOW.md#4-agent-routing) — the routing table
- [`../../../AGENTS.md`](../../../AGENTS.md) §3 — never assume what can be checked

## Step 1 — Run the gate, and read what it computed

```bash
bash scripts/verify-changes.sh --range origin/main..HEAD
```

It prints the file list, the **classification**, the **impact radius**, any **contract
changes**, and the reviewers those imply. Those four outputs drive everything below. Quote them;
do not summarise them from memory.

An exit code of `1` means the answer is already `BLOCK`. Finish gathering the picture anyway, so
the report is complete in one pass.

## Step 2 — Understand the blast radius

Run the `impact-analyzer` agent when **any** of these is true:

- radius is `CROSS-FEATURE`, `SYSTEM`, or `PRODUCTION-CRITICAL`
- the gate reported a contract change
- the change spans more than one directory under `src/`

Otherwise skip it, and say that you skipped it and why.

The output you need from it: who consumes what changed, which dimensions moved, and the
regression hypotheses with a way to settle each one.

## Step 3 — Select the checks

Route by class from [`docs/AI-WORKFLOW.md`](../../../docs/AI-WORKFLOW.md#4-agent-routing), then
escalate by radius per [`docs/AI-VERIFICATION.md`](../../../docs/AI-VERIFICATION.md) §5.

**Write down what you are not running, and why.** An omitted reviewer and a forgotten one look
identical in a report, and only one of them is a decision.

## Step 4 — Run them

Deterministic first — they are authoritative and they fail fastest:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Then the selected reviewers. Then the smallest browser flow that covers the change, if it
touches the browser — not the whole E2E suite for a copy edit.

While the repository is pre-implementation, the `pnpm` steps are
`NOT_APPLICABLE — pre-implementation`. That is a real result. `PASS` would be a lie and `FAIL`
would be noise.

## Step 5 — Settle the regressions

Every hypothesis from Step 2 ends in one of three states:

| State | Meaning |
|---|---|
| **Covered** | An existing test pins it, and that test passed |
| **Coverable** | No test pins it — write one in this change |
| **Not automatically verifiable** | Name it in the report so a human looks |

An unresolved hypothesis that is *coverable* is a `BLOCK`. Writing the test is the fix.

## Step 6 — Decide and report

One state: `PASS`, `PASS_WITH_WARNINGS`, or `BLOCK`. Rules in
[`docs/AI-VERIFICATION.md`](../../../docs/AI-VERIFICATION.md) §8; report format in §9.

Every check line is `PASS`, `WARN`, `FAIL`, `NOT_APPLICABLE`, or `NOT_VERIFIED`. There is no
sixth state, and `NOT_VERIFIED` is never written as `PASS`.

## Rules

1. **A check that did not run is `NOT_VERIFIED`.** Never `PASS`. Then decide whether the gap
   blocks, given the radius.
2. **Deterministic beats advisory.** A failing test outranks a reviewer's approval, always.
3. **Every finding carries evidence** — a path and line, a command output, a query plan, a
   browser observation. "This may be insecure" is not a finding; "this endpoint passes the
   client-supplied `url` to a server-side fetch with no host validation" is.
4. **Every AI finding carries a confidence** — `HIGH`, `MEDIUM`, `LOW`. An uncertain hypothesis
   presented as a defect burns the maintainer's trust in the whole report.
5. **Deduplicate by root cause.** Two reviewers, one problem, one finding.
6. **Only a human accepts risk**, and the acceptance is recorded — §10 of the reference.
7. **Never claim production safety.** Say what was checked.
8. **Be proportionate.** A copy fix does not get five reviewers. Overweight process gets skipped,
   and a skipped process protects nothing.

## Common mistakes

- Reporting `PASS` for a suite that does not exist yet. It is `NOT_APPLICABLE`.
- Running every reviewer so the report looks thorough. It trains the maintainer to skim.
- Treating a green L1 gate as a merge decision. It proves the change is not *obviously* unsafe.
- Listing regression hypotheses and never settling them.
- Deferring the documentation update to a follow-up PR. It does not happen.
- Assuming a fix worked without re-running the check that caught it.
- Averaging two contradicting reviewers into a compromise neither argued for. Escalate instead.

## Verification expectations

- The gate ran, and its output is quoted.
- The radius is stated, and confirmed or corrected with a reason.
- Selection **and** non-selection are both justified.
- Every regression hypothesis has a state.
- Everything unverified is listed as unverified.

## Exit criteria

```
[ ] scripts/verify-changes.sh run; findings resolved or recorded as accepted
[ ] impact radius stated, confirmed or corrected with a reason
[ ] impact-analyzer run, or skipped with a stated reason
[ ] contract changes have their consumers identified
[ ] reviewers selected by class and radius; non-selection justified
[ ] deterministic checks run, or marked NOT_APPLICABLE with the reason
[ ] every regression hypothesis is covered, coverable-and-written, or named for a human
[ ] findings deduplicated by root cause and ordered by consequence
[ ] documentation updated in this change, or confirmed unaffected
[ ] ADR added if the decision is expensive to reverse
[ ] one decision issued: PASS | PASS_WITH_WARNINGS | BLOCK
[ ] nothing reported as passed that did not run
```
