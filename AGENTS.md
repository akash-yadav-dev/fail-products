# AGENTS.md — instructions for AI coding agents

Binding for **every** agent, session, and automated tool that edits this repository, whatever
the vendor. Read this before your first edit.

Two files bind you. This one carries **engineering constraints**.
[`CLAUDE.md`](./CLAUDE.md) carries **repository governance** — commit identity, branch rules,
secrets. Neither overrides the other; both apply.

---

## 1. What this project is

FailProducts is an open-source public directory for products that failed, stalled, or never
found traction. It documents failure so it becomes discoverable, discussable, and useful.

> Roast the product. Help the builder.

It is built and operated by **one person with a full-time job**, on **metered infrastructure**,
as a **fully public repository**, hosting **adversarial user content about named real
businesses**. Every constraint below follows from one of those four facts.

## 2. Priority ladder

When two goals conflict, the higher one wins. Do not silently trade down the ladder.

```
Correctness → Security → Simplicity → Maintainability → Performance → Scalability
```

Scalability is last on purpose. It is earned by measurement, never anticipated.

## 3. Never assume what can be checked

This is the rule most often broken, and the most expensive one to break.

**If a fact is verifiable, verify it before you act on it.** Do not infer it, do not recall it,
do not reason from what is usually true.

| The question is about | Then you must |
|---|---|
| Anything in this repository | Read the file. Grep for it, glob for it, open it. Never describe code you have not opened |
| A provider limit, price, API, or behaviour | Fetch the primary documentation and record the date. Vendor limits move |
| A package size, maintenance status, licence, or Workers compatibility | Run the `dependency-gate` commands against the real package |
| Whether something already exists here | Search for it. Duplicate utilities are written by agents who assumed there was none |
| A claim that will be rendered to users or written into docs | Verify against a primary source, per `docs/MODERATION.md` §8 |
| Why a decision was made | Read `docs/DECISIONS.md`. Do not reconstruct the reasoning from the outcome |

**Never guess at anything sensitive.** Security behaviour, authorization rules, personal-data
handling, retention, licensing, moderation policy, and infrastructure configuration are
verified or they are escalated — never assumed. A plausible guess in these areas is worse than
an admission of uncertainty, because it looks like an answer.

When you genuinely cannot verify something:

1. Say so explicitly, in the output, at the point it matters.
2. Label it `ASSUMPTION:` or `UNVERIFIED:` — never bury it in prose.
3. State what evidence would settle it.
4. If the work is unsafe or useless when the assumption is wrong, **stop and ask** rather than
   proceeding on a guess.

Every review agent reports an `Unverified` section. An empty one is a valid result; an absent
one is a defective review. "It probably", "typically", and "should be" are all signals that a
check was skipped and narrated instead.

## 4. Read before you write

Mandatory before any non-trivial change:

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — boundaries, runtime paths, scalability stages
- [`docs/CODE-STRUCTURE.md`](./docs/CODE-STRUCTURE.md) — where code goes
- [`docs/ENGINEERING.md`](./docs/ENGINEERING.md) — coding, database, API, testing rules
- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — what is already settled, and why

Then the one that matches your task: [`SECURITY.md`](./docs/SECURITY.md),
[`DESIGN.md`](./docs/DESIGN.md), [`PRODUCT.md`](./docs/PRODUCT.md),
[`MODERATION.md`](./docs/MODERATION.md), [`LEGAL.md`](./docs/LEGAL.md),
[`DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

**Documentation is the specification.** The repository is pre-implementation: code follows the
docs, not the reverse. A change that contradicts a doc updates that doc *in the same PR*.

Where a doc and the code genuinely disagree, report the discrepancy. Prefer the implementation
for describing current state, prefer the doc for deciding intent, and never silently overwrite
either side.

## 5. Architecture constraints

```
app → components → services → domain
app → services → repositories → db
services → integrations
```

`domain/` imports nothing from Next.js, Cloudflare, Neon, Drizzle, React, or ZeptoMail — ever.
`components/` imports nothing from `db/` or `integrations/`.

A dependency-direction violation is a blocker, not a preference. It is what keeps the system
portable, and portability is why the project can survive a provider change.

Full rules: the [`architecture`](./.claude/skills/architecture/SKILL.md) skill.

## 6. Simplicity is a hard requirement

The project is at **Stage 0** in [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md) §10.

Do not add Redis, queues, a search service, read replicas, microservices, a monorepo, or a
second database. Not because they are bad — because nothing here has measured a need for them,
and a solo maintainer pays for every one of them forever.

Reject, with the same firmness as a bug:

- an abstraction with exactly one implementation
- a folder created for a single file with no siblings coming
- a barrel `index.ts` that only shortens imports
- an interface extracted "for testability" where the concrete type tests identically
- a dependency that replaces 20–50 lines of readable code

Anything on the [complexity gate](./docs/AI-WORKFLOW.md#8-complexity-gate) list needs a written
justification before it is built. The default answer is **no**.

## 7. Security expectations

Assume every input is hostile, because here it usually is.

- Every mutation follows `parse → validate → authenticate → authorize → rate-limit → domain → persist → safe response`
- Authorization re-loads the resource server-side and checks against the **session**, never a
  client-supplied field
- User content is escaped at render. `dangerouslySetInnerHTML` over user input is a blocker
- External URLs: `http`/`https` only, validated at write *and* at render
- Secrets never enter the repository. `.env.example` holds names only
- No Node-only APIs on a request path — this runs on Workers

Full rules: the [`security`](./.claude/skills/security/SKILL.md) skill and
[`docs/SECURITY.md`](./docs/SECURITY.md).

## 8. Testing expectations

Test behaviour, not implementation. A test that breaks when a function is renamed, though
nothing changed for a user, is a maintenance cost with no benefit.

- Domain rules → unit tests
- Repositories, constraints, services → integration tests against a Neon **development branch**
- The flows listed in [`ENGINEERING.md`](./docs/ENGINEERING.md) §10 → Playwright E2E
- Every bug fix ships with the regression test that would have caught it

Full rules: the [`testing`](./.claude/skills/testing/SKILL.md) skill.

## 9. Dependencies and infrastructure

Adding a package, a provider, a service, or a background process requires the
[`dependency-gate`](./.claude/skills/dependency-gate/SKILL.md) skill first, and an
[ADR](./.claude/skills/adr/SKILL.md) when the choice is expensive to reverse.

Workers compatibility is checked against the real package, never assumed. Native modules and
anything needing `fs`, `child_process`, `net`, or a Node `crypto` KDF are automatic rejections.

## 10. Contribution expectations

- **Never push to `main`.** Branch → PR → maintainer review. No agent approves, merges, or
  force-pushes.
- Every commit is signed off: `git commit -s`. No AI attribution anywhere — `CLAUDE.md` §1.
- Run the gate before pushing: `bash scripts/verify-changes.sh`
- Run `pre-merge-verify` before opening or merging a PR.
- Report honestly. A skipped check is reported as **skipped**, never as passed. A check that
  could not run is `NOT_VERIFIED`, never `PASS` — see
  [`docs/AI-VERIFICATION.md`](./docs/AI-VERIFICATION.md) §8.
- Finish the whole task. If part is blocked, complete the rest and say exactly what you left out.

## 11. The system you are working inside

```
Task → classify → skills → implement → review agents → verify → PR
```

- **[`docs/AI-WORKFLOW.md`](./docs/AI-WORKFLOW.md)** — the process: task classification, which
  reviewers to run, the complexity gate, the pre-push verification layer.
- **[`docs/AI-VERIFICATION.md`](./docs/AI-VERIFICATION.md)** — the verification rules: the three
  levels, impact radius, severity and confidence, and the `PASS` / `PASS_WITH_WARNINGS` /
  `BLOCK` decision logic. [`AI-VERIFICATION-FLOW.md`](./docs/AI-VERIFICATION-FLOW.md) shows them
  applied to real changes.
- **[`docs/AI-DEVELOPMENT.md`](./docs/AI-DEVELOPMENT.md)** — the catalogue: every agent, every
  skill, MCP usage and its safety model, and how to add or change one.
- **[`.claude/agents/`](./.claude/agents/)** and **[`.claude/skills/`](./.claude/skills/)** — the
  definitions themselves. Public on purpose: a contributor can read exactly what their PR will
  be reviewed against, and run the same reviews locally.

Do not run every reviewer on every task. Route with the table in
[`AI-WORKFLOW.md`](./docs/AI-WORKFLOW.md#4-agent-routing).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
