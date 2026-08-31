---
name: pre-push-verify
description: Verify what changed and whether it is safe to push, before pushing. Use before every push, before opening a PR, and whenever asked "is this ready" or "what did we change". Runs the deterministic gate, then performs the judgement the script cannot — doc sync, ADR need, and which reviewers the change requires.
---

# Pre-push verification

## Purpose

Answer two questions honestly before anything leaves the machine:

1. **What did I actually change?**
2. **Is it safe to push?**

This repository is public and its history is permanent. A secret pushed once is compromised
even after it is deleted, and a force-push to fix it is forbidden. The cheapest place to catch
that is here.

## When to use it

- Before every `git push`
- Before opening a pull request
- When asked "is this ready", "what did we change", or "is this safe to push"
- After a long session, before handing work back

## The two layers

**Deterministic** — `scripts/verify-changes.sh`, also run automatically by `.githooks/pre-push`.
It checks the things a script can prove. It cannot be argued with, and it blocks the push.

**Judgement** — the part below the script. Whether documentation still matches, whether a
decision needs an ADR, which reviewers this change requires. A script cannot answer these, and
skipping them is how a technically clean push introduces drift.

Both are required. The script passing is not the same as the change being ready.

## Step 1 — Run the gate

```bash
bash scripts/verify-changes.sh          # working tree + unpushed commits
bash scripts/verify-changes.sh --staged # staged only
pwsh scripts/verify-changes.ps1         # same thing on Windows PowerShell
```

It reports what changed, classifies the change, and then blocks on:

| Blocked | Why |
|---|---|
| On branch `main` | `main` is protected — `CLAUDE.md` §2 |
| `.env` / `.dev.vars` in the change | Never committed — `CLAUDE.md` §4 |
| `.env.example` containing values | Names only |
| A credential pattern in added lines | Connection strings, API keys, private keys, JWTs |
| A non-allowlisted email address | Public history is permanent |
| AI attribution in a commit message | `CLAUDE.md` §1 |
| A commit without DCO sign-off | `git commit -s` — `docs/CONTRIBUTING.md` §3 |
| A commit authored by the wrong identity | `scripts/setup-git-identity.sh` |
| A modified existing migration | Applied migrations are immutable — fix forward |
| A real identifier in `.claude/` or `mcp/` | Both are as public as `README.md` |

Warnings do not block, and they are **not** automatic passes. Read each one and decide.

**Never bypass with `--no-verify` to make a push succeed.** A bypass is a decision that belongs
in the PR description, and only the maintainer makes it.

## Step 2 — Read what actually changed

Do not skip this because the gate was green. The gate proves the change is *safe*; it says
nothing about whether it is *right*.

```bash
git diff --stat <base>..HEAD
git diff <base>..HEAD
```

Confirm three things, and say them out loud in your summary:

- **Every changed file was changed on purpose.** A file you do not remember touching is the
  finding.
- **Nothing unrelated rode along** — a stray formatting sweep, an editor artefact, a debug line.
- **What you say you changed is what the diff says you changed.** `AGENTS.md` §3 applies to
  your own report: do not describe the change from memory of your intent. Read the diff.

## Step 3 — Documentation sync

Documentation is the specification here (`AGENTS.md` §4). The gate warns when `src/` moved
without `docs/`, but it cannot tell whether the documented behaviour actually changed. You can.

Ask, and answer against the actual documents:

- Does this contradict `docs/ARCHITECTURE.md`, `docs/ENGINEERING.md`, or `docs/CODE-STRUCTURE.md`?
- Does it change something `docs/PRODUCT.md` or `docs/SECURITY.md` promises?
- Does it add personal data? Then `docs/LEGAL.md` §5 changes **in this PR**.
- Does it change a public URL, a status model, or an auth path? Then check `docs/DECISIONS.md`
  for the ADR that governs it.

A doc change that belongs in this PR and is deferred to "a follow-up" does not happen.

## Step 4 — ADR check

If the change makes a decision that is expensive to reverse — a provider, a data model, an
infrastructure addition, an auth or moderation change, a licence question — it needs an ADR
before it merges. Use the `adr` skill.

Reversing anything locked in `CLAUDE.md` §9 requires a superseding ADR, not an argument.

## Step 5 — Route the reviewers

The gate prints a classification. Use it to pick reviewers from
[`docs/AI-WORKFLOW.md`](../../../docs/AI-WORKFLOW.md#4-agent-routing) — and run them. Do not run
all of them; do not run none of them.

## Step 6 — Report honestly

State, in this order: what changed, the gate result, what you verified yourself, and what you
did not.

```
CHANGE VERIFICATION

What changed:
- <files and behaviour, read from the diff — not from memory>

Classification: <FEATURE | BUGFIX | DATABASE | UI | SECURITY | ... >

Gate: PASS | PASS WITH WARNINGS | BLOCKED
- <each warning, and the decision taken on it>

Documentation: in sync | updated in this change | needs <file> updating
ADR: not required | ADR-0nn added | required and missing

Reviewers run:
- <agent> -> <status>

Unverified:
- <anything not checked, and what would settle it. "None" is valid>

Safe to push: yes | no — <one sentence>
```

## Common mistakes

- Treating a green gate as "the change is good". It means the change is not obviously dangerous.
- Bypassing with `--no-verify` because the finding looked like a false positive. Investigate it;
  the one time it is real is the time it matters.
- Reporting the intended change instead of the actual diff.
- Deferring the doc update to a follow-up PR.
- Running every reviewer, which trains the maintainer to skim all of them.
- Pushing straight after a long session without re-reading the diff.

## Verification expectations

- The gate ran, and its output is quoted rather than summarised from memory.
- The full diff was read, not just the file list.
- Every warning has a stated decision.
- Anything you could not check is listed as unchecked.

## Exit criteria

```
[ ] scripts/verify-changes.sh run, and its findings resolved or consciously accepted
[ ] the full diff read; every changed file intentional
[ ] no unrelated changes riding along
[ ] documentation updated in this change, or confirmed unaffected
[ ] ADR added if the decision is expensive to reverse
[ ] the reviewers for this change class were run
[ ] on a feature/fix/docs/security branch, never main
[ ] every commit signed off, correctly authored, with no AI attribution
[ ] the report states what was not verified
```
