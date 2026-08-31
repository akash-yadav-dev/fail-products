# MCP — Model Context Protocol servers

**Status:** Active
**Last reviewed:** 2026-08-31

MCP lets an AI agent reach outside the repository — to GitHub, Cloudflare, Neon, the shadcn
registry, and a real browser. This document defines **which servers are used, for what, and
under what permissions**.

Part of the AI development system: [`../docs/AI-DEVELOPMENT.md`](../docs/AI-DEVELOPMENT.md) is
the catalogue, [`../docs/AI-WORKFLOW.md`](../docs/AI-WORKFLOW.md) is the process,
[`../AGENTS.md`](../AGENTS.md) is binding.

> **This directory is public.** Everything here is as world-readable as `README.md`. Examples
> carry **placeholder environment variable names only** — never a token, an account ID, a Neon
> endpoint, or a connection string. The pre-push gate blocks real identifiers in this directory.

---

## 1. Why MCP is used here at all

Only where it provides verification that reading the repository cannot:

- **Is the deployed thing actually configured the way the docs say?** Documentation is intent;
  the console is fact. This project has already shipped documentation ahead of implementation,
  which makes the distinction load-bearing.
- **Does the flow work in a real browser?** Keyboard order, focus, responsive layout, and
  no-JavaScript rendering cannot be established from source.
- **What does the registry actually ship?** Checking the shadcn registry beats reimplementing a
  component from memory.

This is the `AGENTS.md` §3 rule with a network connection: **never assume what can be checked.**

MCP is not required for anything. CI never depends on it, and a contributor with no external
accounts can run every check in [`../docs/AI-DEVELOPMENT.md`](../docs/AI-DEVELOPMENT.md) §7.

## 2. The permission model

Every MCP operation falls into one of three classes. This classification is binding — ADR-024.

### Read — safe by default

Inspect files, schema, deployments, logs, pull requests, CI status, registry contents.

Agents use these freely. Reading is how an assumption becomes a fact.

### Write — requires task intent

Create an issue, open a pull request, update a non-production configuration, apply a migration
to a **development** branch, install a component.

Permitted only when it is what the user actually asked for. "I was inspecting and it seemed
sensible" is not intent. State the write before making it.

### Destructive — requires explicit human authorization, every time

Delete production data · drop or reset a database · delete a resource, bucket, or branch ·
remove a deployment · rotate a production secret · force-push · modify production environment
variables · deploy to production.

**No agent performs a destructive operation as a routine step.** Not as cleanup, not to unblock
itself, not because it looks reversible. The agent describes what it would do and stops. A human
runs it, or explicitly authorizes that specific operation.

Authorization does not carry forward. Approval for one destructive operation is not approval for
the next one.

### The production rule

**Agents are never autonomous over production infrastructure.** Read production to diagnose;
change production only with a human in the loop. Where a development branch or preview
environment exists, use it — Neon development branches exist precisely so nothing needs to touch
production to be verified.

## 3. The servers

### GitHub

**Use for:** repository inspection, issues, pull requests, commits, workflow runs, CI status,
review context.

| Class | Examples |
|---|---|
| Read | List PRs, read CI status, read issues, read workflow logs |
| Write | Open an issue, open a PR, comment |
| Destructive | Delete a branch or release, force-push, change repository settings, merge |

**Never merges, approves, or force-pushes** — `../CLAUDE.md` §2. An agent opening a PR is
correct; an agent approving one is not, and branch protection is configured so it cannot.

Prefer a fine-grained token scoped to this repository, read-only unless a write is the task.

### Cloudflare

**Use for:** Workers, R2, DNS, deployment status, configuration verification, operational checks.

| Class | Examples |
|---|---|
| Read | Deployment status, Worker config, R2 bucket listing, DNS records, analytics |
| Write | Update a preview configuration, upload a non-production asset |
| Destructive | **Deploy to production**, delete a Worker or bucket, change DNS, rotate a secret |

Most valuable use: confirming that what `docs/DEPLOYMENT.md` describes is what is actually
configured — CPU limits, cache rules, R2 bucket policy, Turnstile widget setup. Verify the fact,
record the date.

Deployment is a human action. `release-verifier` reports readiness; it does not deploy.

### Neon

**Use for:** schema inspection, query plans, index verification, migration validation.

| Class | Examples |
|---|---|
| Read | Inspect schema, run `EXPLAIN`, list branches, check table sizes |
| Write | Apply a migration to a **development branch** |
| Destructive | Anything against production, `DROP`, `TRUNCATE`, reset, delete a branch |

**Prefer read-only access.** Configure the connection as read-only unless the task is a
migration, and then point it at a development branch.

**Never run a migration against production from an agent session.** The `database` skill says
this and it is repeated here because it is the single most expensive mistake available in this
project: the database is the only part that redeploying cannot roll back.

Real value: verifying an index is actually used, that a query plan matches the assumption, and
that a migration applies cleanly to realistic data — all things `EXPLAIN` answers and intuition
does not.

### shadcn

**Use for:** component discovery, registry search, reading component source, installation.

| Class | Examples |
|---|---|
| Read | Search the registry, read a component's source and dependencies |
| Write | Install a component into `src/components/ui/` |
| Destructive | — none |

Check the registry **before** building a primitive. Reimplementing a Dialog, Select, or Tooltip
that shadcn already ships accessible is the most common avoidable work in this codebase — see
the [`ui`](../.claude/skills/ui/SKILL.md) skill.

### Playwright

**Use for:** real-browser verification — authentication, product creation and editing, comments,
waitlists, navigation, responsive layout, accessibility.

| Class | Examples |
|---|---|
| Read | Navigate, snapshot, inspect the accessibility tree, check console and network |
| Write | Fill and submit forms **against local or preview environments** |
| Destructive | Any interaction against production with real user data |

Point it at local or preview. Never drive production with real accounts.

**Playwright MCP complements the E2E suite; it does not replace it.** MCP exploration is not
repeatable and does not run in CI. When it finds a bug, the fix ships with a Playwright test in
`tests/e2e/` — see the [`testing`](../.claude/skills/testing/SKILL.md) skill.

## 4. Configuration

Examples live in [`examples/`](./examples/):

- **[`mcp.readonly.json`](./examples/mcp.readonly.json)** — the daily driver. Read-only
  everywhere it can be. Start here.
- **[`mcp.full.json`](./examples/mcp.full.json)** — adds write-capable servers, for the sessions
  that genuinely need them.

Copy one to wherever your client reads MCP config from (for Claude Code, `.mcp.json` at the
repository root, which is **git-ignored**), then supply credentials through your environment.

```bash
cp mcp/examples/mcp.readonly.json .mcp.json
```

### Credentials

Every example references environment variables by name and contains no values.

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN=...   # fine-grained, this repo, read-only
export CLOUDFLARE_API_TOKEN=...           # least privilege for the task
export NEON_API_KEY=...                   # development branch access
```

Set them in your shell profile or a local secret manager. **Never** in `.mcp.json`, never in a
committed file, never in a skill or agent definition. The pre-commit and pre-push hooks block
credential patterns, but they are a net, not a permission slip.

If a credential is ever pasted into a file in this repository, treat it as compromised and
rotate it. Public git history is permanent, and removing the file does not remove the commit.

## 5. Before enabling a server

```
[ ] the token is scoped to the minimum needed, and read-only if the task is read-only
[ ] it points at development or preview, not production, unless a human is running it
[ ] the credential is in the environment, never in a file
[ ] the server is one of the five above, or has been justified through the complexity gate
[ ] you can state what verification it provides that reading the repository cannot
```

Adding a sixth MCP server is a complexity-gate decision —
[`../docs/AI-WORKFLOW.md`](../docs/AI-WORKFLOW.md#8-complexity-gate). Convenience is not a
justification.
