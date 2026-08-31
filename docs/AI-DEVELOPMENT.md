# FailProducts — AI Development System

**Status:** Active
**Last reviewed:** 2026-08-31

The catalogue: what each agent and skill does, which MCP server is used for what, and how to
extend the system. The **process** lives in [`AI-WORKFLOW.md`](./AI-WORKFLOW.md); the **binding
rules** live in [`../AGENTS.md`](../AGENTS.md) and [`../CLAUDE.md`](../CLAUDE.md).

FailProducts is built with AI-agent assistance under human ownership. This document exists so a
contributor can read exactly what standards their pull request will be held to, and run the same
reviews locally.

---

## 1. Ownership principle

**Agents propose. The maintainer decides.**

No agent merges to `main`, approves a pull request, force-pushes, rewrites history, or publishes
a release. Every change reaches `main` through a pull request the maintainer has reviewed.

Every commit is authored by the maintainer. There is no agent attribution anywhere in the
repository — no `Co-Authored-By` trailers, no generated-with footers, no bot identities. The git
history records who is accountable for the code, and that is a person. See ADR-022 and ADR-023.

## 2. Commit identity

```
Akash Yadav <180740493+akash-yadav-dev@users.noreply.github.com>
```

Configured once per clone:

```bash
bash scripts/setup-git-identity.sh     # macOS / Linux / Git Bash
pwsh scripts/setup-git-identity.ps1    # Windows PowerShell
```

The script sets repo-local `user.name` and `user.email` and points `core.hooksPath` at
[`../.githooks/`](../.githooks/), which contains:

- **`commit-msg`** — strips AI attribution trailers, blocks any email address other than the
  GitHub noreply address, and refuses the commit if `user.email` is misconfigured.
- **`pre-commit`** — blocks `.env` files and staged content matching credential patterns or a
  non-allowlisted email address.
- **`pre-push`** — runs the full verification gate, and refuses any push to `main`.

These hooks are versioned, so they apply to every clone and every tool — not only to Claude Code
sessions. That is the point: the guarantee has to hold for parallel agents and for contributors
using different tooling.

Commits are DCO signed off: `git commit -s`.

## 3. Where the system lives

```
AGENTS.md                    binding engineering constraints — read first, any tool
CLAUDE.md                    binding repository governance — identity, branches, secrets

.claude/agents/              eight agents — six reviewers, an analyzer, an orchestrator
.claude/skills/              eleven procedures
mcp/                         MCP server configuration and safety model
scripts/verify-changes.*     the pre-push verification gate
.githooks/                   commit-msg, pre-commit, pre-push
.github/workflows/ci.yml     the server-side half of verification

docs/AI-DEVELOPMENT.md       this file — the catalogue
docs/AI-WORKFLOW.md          the process
```

**Why `.claude/` and not a root `agents/` directory.** Claude Code discovers agents and skills
in `.claude/` automatically. A root `agents/` folder would make the definitions documentation
that nothing executes — the reviews would have to be run by hand, or not at all. `AGENTS.md` at
the root is the tool-neutral entry point, so a non-Claude agent still finds the rules. MCP
config lives in `mcp/` rather than `.claude/` because it is not tool-specific.

`.claude/` and `mcp/` are committed on purpose and are **as public as `README.md`**. Nothing in
them may contain credentials, private URLs, infrastructure identifiers, or personal data. The
verification gate enforces this.

## 4. The agents

Eight agents: **six reviewers**, each owning one concern, plus an **impact analyzer** and an
**orchestrator** that serve the verification pipeline rather than reviewing code themselves.
An agent that reviews everything reviews nothing well.
Routing table: [`AI-WORKFLOW.md`](./AI-WORKFLOW.md#4-agent-routing).

| Agent | Owns | Run it when |
|---|---|---|
| [`architecture-reviewer`](../.claude/agents/architecture-reviewer.md) | Structure, module boundaries, dependency direction, unnecessary complexity | A PR adds directories, crosses a layer, or adds an abstraction |
| [`security-reviewer`](../.claude/agents/security-reviewer.md) | Vulnerabilities and remediation, across twelve domains | Auth, uploads, user content, URLs, email, queries, config, or a new dependency |
| [`performance-reviewer`](../.claude/agents/performance-reviewer.md) | Rendering, server/client boundaries, query cost, bundle, caching, Core Web Vitals | A page, query, image, chart, or cache setting changes |
| [`product-quality-reviewer`](../.claude/agents/product-quality-reviewer.md) | User value, clarity, tone, community effect, accessibility | Anything a visitor, founder, or moderator sees or does |
| [`release-verifier`](../.claude/agents/release-verifier.md) | The final go/no-go before production | Before any production deploy, launch, upgrade, or migration |
| [`scope-skeptic`](../.claude/agents/scope-skeptic.md) | Whether the work should happen at all; owns the complexity gate | Before building anything new, or when the complexity gate fires |
| [`impact-analyzer`](../.claude/agents/impact-analyzer.md) | Blast radius: consumers, contracts, regressions. Read-only, produces a map not a judgement | The radius is CROSS-FEATURE or above, or the gate reports a contract change |
| [`verification-orchestrator`](../.claude/agents/verification-orchestrator.md) | The pre-merge pipeline and the final PASS / PASS_WITH_WARNINGS / BLOCK decision | Before opening or merging a PR |

Two of these were renamed from earlier equivalents as the system was formalised:
`structure-guardian` → `architecture-reviewer`, and `security-auditor` → `security-reviewer`.
`scope-skeptic` was kept under its own name because subtraction is a distinct job from
architecture review, and no reviewer in the standard set does it.

`impact-analyzer` and `verification-orchestrator` are not reviewers. They serve the verification
pipeline — one maps what a change reaches, the other runs the pipeline and issues the decision.
Neither judges code quality; that is what the six reviewers are for. See ADR-025.

Every agent reports an **`Unverified`** section. An empty one is a valid result; an absent one is
a defective review — see `AGENTS.md` §3.

## 5. The skills

Skills are reusable instruction modules, not personas. They encode a procedure so it happens the
same way every time.

**Domain skills** — the rules for building in an area:

| Skill | Use when |
|---|---|
| [`architecture`](../.claude/skills/architecture/SKILL.md) | Placing code, adding a directory or abstraction, starting a multi-file feature |
| [`database`](../.claude/skills/database/SKILL.md) | Schema, queries, indexes, migrations, pagination, backfills |
| [`ui`](../.claude/skills/ui/SKILL.md) | Any component, page, form, or layout |
| [`performance`](../.claude/skills/performance/SKILL.md) | Rendering, queries, caching, images, bundle |
| [`security`](../.claude/skills/security/SKILL.md) | Auth, authorization, validation, user content, uploads, secrets |
| [`testing`](../.claude/skills/testing/SKILL.md) | Deciding what to test and writing it |

**Procedural skills** — a specific gate or ritual:

| Skill | Use when |
|---|---|
| [`adr`](../.claude/skills/adr/SKILL.md) | A decision will be expensive to reverse |
| [`dependency-gate`](../.claude/skills/dependency-gate/SKILL.md) | Any package is added, replaced, or upgraded |
| [`pre-push-verify`](../.claude/skills/pre-push-verify/SKILL.md) | Before every push — the fast local gate (L1) |
| [`pre-merge-verify`](../.claude/skills/pre-merge-verify/SKILL.md) | Before opening or merging a PR — impact, reviewers, regressions (L2) |
| [`release-check`](../.claude/skills/release-check/SKILL.md) | Before any production deploy |

Each skill states: purpose, when to use it, context needed, rules, checks, common mistakes,
verification expectations, and exit criteria.

**Skill and agent do not duplicate each other.** The skill is the specification a builder
follows; the agent is the independent check on it. `release-check` holds the checklist;
`release-verifier` executes and verifies it.

## 6. MCP servers

MCP is used only where it provides genuine external verification that reading the repository
cannot. Full configuration, per-server guidance, and the permission model:
[`../mcp/README.md`](../mcp/README.md).

| Server | Used for |
|---|---|
| GitHub | Repository, issues, PRs, commits, workflow and CI status |
| Cloudflare | Workers, R2, DNS, deployment and configuration verification |
| Neon | Database and schema inspection — read-only by default |
| shadcn | Component discovery, registry search, installation |
| Playwright | Real-browser verification of flows, responsive layout, accessibility |

Operations are classified **read** (safe by default), **write** (requires task intent), and
**destructive** (requires explicit human authorization, never routine). MCP servers are never
required for CI, and no agent is autonomous over production infrastructure — ADR-024.

## 7. Running the checks yourself

Everything an agent checks, a contributor can run. Nothing here needs an AI tool or an external
account.

```bash
# Install identity and hooks — once per clone
bash scripts/setup-git-identity.sh

# What did I change, and is it safe to push?
bash scripts/verify-changes.sh
bash scripts/verify-changes.sh --staged
bash scripts/verify-changes.sh --range origin/main..HEAD

# Windows PowerShell
pwsh scripts/verify-changes.ps1

# Does the gate itself still work? Builds a throwaway repo and asserts on every guard.
bash scripts/test-verify-changes.sh
```

The gate prints a **classification**, an **impact radius**, and any **contract changes**, then
the reviewers those imply. Definitions and decision rules:
[`AI-VERIFICATION.md`](./AI-VERIFICATION.md).

The gate also runs automatically on `git push`, and again in CI where it cannot be bypassed.

Once an application exists, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` are the
same commands CI runs.

The agent and skill definitions are plain Markdown. Read them — they are the review standard,
written out.

## 8. Extending the system

### Adding a skill

1. **Justify it.** Eleven skills is at the ceiling a solo maintainer can keep coherent. If
   the procedure fits inside an existing skill, extend that instead. A skill nobody invokes is
   worse than no skill, because it dilutes the ones that matter.
2. Create `.claude/skills/<name>/SKILL.md`. The directory name and the `name:` field must match —
   CI enforces this.
3. Frontmatter: `name` (lowercase, hyphenated) and `description` stating **when to use it**, not
   what it contains. The description is how the skill gets selected.
4. Follow the section structure every other skill uses: purpose, when to use, context needed,
   rules, checks, common mistakes, verification expectations, exit criteria.
5. Reference the authoritative document; do not restate it. Skills point at `docs/`, they do not
   copy it.
6. Add it to §5 above, and to the routing table in [`AI-WORKFLOW.md`](./AI-WORKFLOW.md#4-agent-routing).

### Adding a reviewer

1. **Justify it harder.** Eight is already a lot. A new agent must own a concern no existing
   one covers — not a variation of one.
2. Create `.claude/agents/<name>.md`. Filename and `name:` must match.
3. Frontmatter: `name`, `description` (when to invoke), `tools` (least privilege — read-only
   unless it must apply fixes), `model`.
4. Reference the skill it applies. The agent defines *how to review*; the skill defines *the
   rules*. Never restate the rules in the agent.
5. Define an explicit output format with a status, findings, and an `Unverified` section.
6. Add it to §4 above and to the routing table.

### Modifying a skill or agent

Change the definition and the places that reference it in the same PR: this file, the routing
table, `../AGENTS.md` if it names the skill, and `../README.md` if it states a count. A renamed
agent whose references still point at the old name is worse than no rename.

If the change alters how work is reviewed in a lasting way, it needs an ADR.

### Avoiding conflicting instructions

Each rule has exactly one home. When you need it somewhere else, **link** — do not copy.

| Concern | Lives in |
|---|---|
| Engineering constraints for agents | `AGENTS.md` |
| Repository governance: identity, branches, secrets | `CLAUDE.md` |
| The process, routing, complexity gate | `docs/AI-WORKFLOW.md` |
| The catalogue and how to extend it | `docs/AI-DEVELOPMENT.md` (this file) |
| The rules for an area | The `docs/` file that owns that area |
| How to perform a procedure | The skill |
| How to review it | The agent |
| Why a decision was made | `docs/DECISIONS.md` |

If two files disagree, that is a bug. Fix the duplication rather than picking a winner, and
record the resolution where the rule belongs.

## 9. Rules binding every automated contributor

These apply to any agent, session, or tool.

1. **Never push to `main`.** Branch, PR, wait for review.
2. **Never commit a secret**, a `.env` file, or a private email address.
3. **Never assume what can be verified.** `AGENTS.md` §3. Label anything unverified.
4. **Documentation is the specification.** A change contradicting a doc updates that doc in the
   same PR.
5. **Decisions with lasting consequence require an ADR**, not a commit message.
6. **Respect the dependency direction.** `domain/` imports nothing framework-specific.
7. **Do not add Stage 2+ infrastructure** without a measurement proving the need.
8. **Do not re-litigate locked decisions** in `CLAUDE.md` §9 without a superseding ADR.
9. **Report honestly.** A skipped check is reported as skipped, never as passed.
10. **Run the verification gate before pushing.** Never bypass it to make a push succeed.

## 10. Working with a public repository

`.claude/` and `mcp/` are committed. Agent definitions, skills, and MCP examples are part of the
project's public documentation: a contributor can read exactly what standards their PR will be
held to, and reproduce the reviews.

Nothing in them may contain credentials, private URLs, infrastructure identifiers, or personal
data. MCP examples use placeholder environment variable names only, never values.
