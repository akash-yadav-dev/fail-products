---
name: architecture
description: Place code correctly across the layered architecture and keep the structure simple. Use when starting any feature that touches more than one file, when deciding where something belongs, when adding a directory or an abstraction, and when reviewing whether a change makes the codebase harder to understand. Enforces the dependency direction, the ownership rule, and the complexity gate.
---

# Architecture

## Purpose

Keep FailProducts modular, portable, and legible to a stranger — without paying for structure
it has not earned.

Two failures are equally expensive and this skill prevents both: code in the wrong layer, which
makes the system unportable; and structure invented ahead of need, which makes it unreadable.

## When to use it

- Starting any feature that touches more than one file
- Deciding where a function, type, or component belongs
- Adding a directory, a module, an interface, or an abstraction
- Reviewing a PR that creates folders or crosses a layer boundary
- Any time the answer to "where does this go?" is not immediately obvious

## Context you need first

Read these before placing anything. They are the specification:

- `docs/CODE-STRUCTURE.md` — canonical tree, ownership rule, naming, file size
- `docs/ARCHITECTURE.md` §3 provider boundaries, §4 runtime boundaries, §10 stages, §13 portability
- `docs/ENGINEERING.md` §14 database access pattern, §15 maintainability
- `docs/DECISIONS.md` — ADR-007 (no monorepo), ADR-008 (no Redis/queues), and anything touching your area

And check what already exists before adding anything:

```bash
ls src/domain src/services src/repositories src/lib 2>/dev/null
grep -rn "<the thing you are about to write>" src/ 2>/dev/null
```

Never assume a utility does not exist. Duplicate helpers are written by people who did not look.

## The layers

```
app/            route composition, rendering, metadata          (Next.js aware)
components/     UI                                              (React aware)
services/       application use cases, orchestration            (framework free)
domain/         business rules, state machines, invariants      (dependency free)
repositories/   persistence interfaces and implementations      (Drizzle aware)
db/             schema, migrations, query primitives            (Neon aware)
integrations/   ZeptoMail, GitHub, Cloudflare, analytics        (provider aware)
lib/            cross-cutting: auth, validation, urls, security, config
```

Permitted direction:

```
app → components → services → domain
app → services → repositories → db
services → integrations
```

`domain/` imports nothing from Next.js, Cloudflare, Neon, Drizzle, React, or ZeptoMail.
`components/` imports nothing from `db/` or `integrations/`.

This is not style. It is why the project can change database or email provider without
rewriting its business rules — `docs/ARCHITECTURE.md` §13.

## Order of construction

Build inward-out. Each step is testable before the next exists.

**1. Domain first.** Types, invariants, state transitions, pure functions. No I/O. "A product
can only move to RECOVERING from a published state" lives here — not in a route handler, not in
a component.

**2. Repository interface.** Define what persistence the feature needs, in terms of domain
types. Then implement it with Drizzle.

**3. Service.** The use case. Orchestrates: authorize, load, apply domain rule, persist, emit
side effects. Every mutation follows the `docs/ENGINEERING.md` §6 pipeline:

```
parse → validate → authenticate → authorize → rate-limit → domain use case → persist → safe response
```

**4. Boundary.** A Server Action for a simple form mutation; a Route Handler for anything that
is an external API surface. Zod validation at this line and nowhere deeper — the boundary is
where untrusted input stops being untrusted.

**5. UI.** Server Component by default. A Client Component only when browser state or an event
handler genuinely requires it. Compose from `components/ui/` (shadcn primitives, kept close to
upstream) into a feature folder like `components/products/`. See the `ui` skill.

**6. Tests.** Unit on the domain rules, integration on the repository, E2E if the feature is in
the `docs/ENGINEERING.md` §10 list. See the `testing` skill.

## Placement decisions people get wrong

| Question | Answer |
|---|---|
| Where does slug generation live? | `domain/product/` — a business rule with invariants, not a utility |
| Where does the ownership check live? | `services/` — it needs the session and the loaded row; never in a component |
| Where does the Zod schema live? | `lib/validation/` if shared, otherwise next to the boundary that uses it |
| Where does the ZeptoMail call live? | `integrations/zeptomail/`, invoked from a service — never a component or a domain function |
| Where does outbound URL validation live? | `lib/security/` — used by both the boundary and the renderer |
| Can a Server Component query the DB directly? | For small read-only queries, yes — `docs/ENGINEERING.md` §14 permits it. Core domain operations still go through a service |
| Where do referral click counts get aggregated? | `repositories/` against the rollup table, never by counting raw events in a page render |
| Where does a shared React hook live? | `hooks/` only if used by two or more feature folders; otherwise beside its component |

## Complexity gate

Before adding **any** of the following, produce the justification in
[`docs/AI-WORKFLOW.md`](../../../docs/AI-WORKFLOW.md#8-complexity-gate):

new dependency · new service · new database · new queue · new cache · new abstraction layer ·
new architectural boundary · new external provider · new background process

The default decision is **reject**. The project is at Stage 0 in `docs/ARCHITECTURE.md` §10 and
a solo maintainer pays for every addition forever. Route contested cases to the `scope-skeptic`
agent.

## Structure that is not yet earned

Reject with the same firmness as a boundary violation:

- monorepo or workspace conversion before a second deployable exists
- a `packages/` or `libs/` split inside a single application
- barrel `index.ts` files that only shorten imports — they wreck tree-shaking on Workers
- an abstraction with exactly one implementation and no second one planned
- a folder created for a single file with no siblings coming
- an interface extracted "for testability" where the concrete type tests identically
- a config layer, plugin system, or event bus before two consumers exist

A three-file folder everyone understands beats a nine-file architecture one person understands.

## Non-negotiables for every slice

- **Never fetch your own API from a Server Component.** Call the service directly — `docs/ENGINEERING.md` §3.
- **Never trust a client-supplied id, owner, role, status, or counter.** Load it server-side.
- **Every list is cursor-paginated.** No feed renders without a bound.
- **Every public page has metadata** — title, description, canonical, Open Graph. This product
  lives on search traffic.
- **Every interactive control is keyboard reachable** with a visible focus state — `docs/DESIGN.md` §10.
- **No client JavaScript for decorative purposes** on public pages.

## Checks

Run these against the diff, not from memory:

```bash
# domain must be dependency-free
grep -rnE "from ['\"].*(next/|@neondatabase|drizzle-orm|@cloudflare|react)" src/domain/ 2>/dev/null

# components must not reach persistence or providers
grep -rnE "from ['\"].*(@/db|@/integrations|drizzle-orm|zeptomail)" src/components/ 2>/dev/null

# env access belongs in lib/config and integrations, nowhere else
grep -rn "process\.env" src/domain/ src/components/ 2>/dev/null

# barrel files
find src/ -name "index.ts" -exec grep -l "^export \* from" {} \; 2>/dev/null
```

Empty output is a result. Record it as checked.

## Common mistakes

- Putting a business rule in a route handler because that is where it was first needed.
- Creating `services/` and `repositories/` files for a feature that only reads one row — see
  the §14 exemption before manufacturing layers.
- Extracting a shared component after its second use, when the two uses differ in ways that
  will diverge again. Duplication is cheaper than the wrong abstraction.
- Adding a `types/` file per feature instead of keeping types beside what they describe.
- Splitting a 400-line file on line count alone. Ask what it is doing first.
- Reaching for a dependency to avoid writing 30 lines. Run `dependency-gate` instead.

## Verification expectations

- The grep checks above run clean, or every hit is explained.
- Every new directory has a one-phrase responsibility with no "and" in it.
- A contributor who has never seen the feature can guess where each file lives.
- Anything that triggered the complexity gate has a written justification attached to the PR.

## Exit criteria

```
[ ] domain layer imports nothing framework-specific
[ ] components import nothing from db/ or integrations/
[ ] the mutation pipeline is complete, including the rate limit
[ ] every list is cursor-paginated
[ ] metadata is set on new public routes
[ ] a reserved-slug collision is impossible on new /[slug] routes
[ ] no new abstraction has fewer than two real implementations or consumers
[ ] complexity gate justification written, if triggered
[ ] docs updated if the change alters documented behaviour
```

Run the `architecture-reviewer` agent on the diff when the change adds directories or crosses a
boundary, and the `security-reviewer` agent when it touches auth, uploads, user content, URLs,
or email. Routing table: [`docs/AI-WORKFLOW.md`](../../../docs/AI-WORKFLOW.md#4-agent-routing).
