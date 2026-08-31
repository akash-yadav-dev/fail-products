---
name: database
description: Design schema, write queries, and migrate safely on Neon PostgreSQL with Drizzle. Use for any change to src/db/schema, any new table, column, index, constraint, or enum value, any data backfill, and any query that reads a list. Enforces expand-migrate-contract, reversibility, retention policy, index discipline, and cursor pagination.
---

# Database

## Purpose

The database is the only part of FailProducts that cannot be rolled back by redeploying. This
skill covers everything that touches it: schema design, relations, constraints, indexes,
queries, pagination, transactions, and migrations.

Treat every migration as permanent until proven otherwise.

## When to use it

- Any change to `src/db/schema/`
- A new table, column, index, constraint, enum value, or foreign key
- A data backfill
- Writing or reviewing a query that returns more than one row
- Any change that introduces or moves personal data

## Context you need first

- `docs/ARCHITECTURE.md` §6 database principles, §8 referral tracking and retention
- `docs/ENGINEERING.md` §5 database rules, §14 access pattern
- `docs/LEGAL.md` §5 retention matrix — binding for any personal-data column
- `docs/DECISIONS.md` — ADR-013 (three status columns), ADR-018 (referral retention), ADR-019
  (slug history), ADR-021 (UUIDv7 keys)
- `docs/PRODUCT.md` §10 content model — the entities that exist and what they mean

Read the current schema before changing it. Never infer a column from a type name.

## Before writing anything

1. **Is this change necessary now?** A column added "because we will need it" becomes a column
   nobody can safely drop. Ask the `scope-skeptic` agent if unsure.
2. **Does it change public URLs or existing rows?** If yes, it needs maintainer discussion per
   `docs/CONTRIBUTING.md` §6, and usually an ADR.
3. **Does it introduce personal data?** New personal data requires a row in the retention matrix
   in `docs/LEGAL.md` §5, in the same PR. No exceptions — an undocumented PII column is a
   compliance gap the moment it holds data.

## Schema design rules

**Naming.** Tables `snake_case` and plural (`referral_events`). Columns `snake_case`. Booleans
`is_*`, `has_*`, `can_*`. Timestamps `*_at`, stored as `timestamptz`, always UTC. Foreign keys
`<entity>_id`. Domain entities are singular in code, plural in the database — `docs/CODE-STRUCTURE.md`.

**Primary keys are UUIDv7** (ADR-021). The timestamp prefix keeps index inserts roughly
sequential — which matters on `comments` and `referral_events` — and gives creation ordering for
free in cursor pagination. Raw identifiers never appear in a public URL; slugs and usernames do.

**Constraints belong in the database, not only in Zod.** `NOT NULL`, `UNIQUE`, `CHECK`, and
foreign keys are the last line that holds when application code has a bug. Validation at the
boundary is a user-experience feature; the constraint is the integrity guarantee.

**Every foreign key declares its policy explicitly.** `ON DELETE CASCADE`, `RESTRICT`, or
`SET NULL`, chosen deliberately and justified in a comment. A policy chosen by omission is a bug
waiting for a deletion request.

**Three orthogonal status axes stay separate columns** (ADR-013), never collapsed into one enum:

- `publication_state` — draft, pending_review, published, archived
- `moderation_state` — none, flagged, hidden, removed
- `failure_status` — struggling, low_traction, abandoned, shut_down, recovering

A migration that merges any two is rejected.

**Soft deletion is the default for content, never for personal data.** Content stays so
discussion context survives; personal data is erased or irreversibly anonymised per the
retention matrix. A soft-deleted row that still holds an email address does not satisfy a
deletion request.

**No JSON column as a place to avoid deciding.** JSONB is legitimate for genuinely
schemaless third-party payloads in `integrations/`. It is not a substitute for columns, and
state that the application branches on never lives in JSON — it cannot be constrained, indexed
cheaply, or migrated safely.

**Derived counters need a reason.** Prefer an aggregate query first. Add a denormalised counter
only after profiling shows the need, and only with the write path that keeps it correct.

## Indexes

Indexes follow **measured** access patterns. Write the query first, check the plan, then index.
Every index costs write throughput and storage on a 0.5 GB plan.

```sql
EXPLAIN ANALYZE <the actual query>;
```

- Index the columns a `WHERE`, `JOIN`, or `ORDER BY` actually uses, in that order.
- A composite index serves queries that use its leading columns. Three single-column indexes
  usually do not do what people expect.
- A unique constraint already creates an index. Do not add a second.
- Partial indexes (`WHERE published_at IS NOT NULL`) are often the right answer for a
  directory that queries mostly published rows.
- Full-text and trigram search stays in PostgreSQL for MVP — `docs/ARCHITECTURE.md` §7. No
  external search service without a measurement.

Do not add an index because a column "will be queried". That is the assumption `AGENTS.md` §3
forbids, expressed in SQL.

## Queries

- **Every list read is bounded.** Cursor pagination, not offset — offset degrades with depth and
  skips rows when the underlying set changes.
- **Cursor on `(created_at, id)` or the UUIDv7 key**, never on a non-unique column alone.
- **No `SELECT *` on a frequently executed query.** Select the columns you render.
- **No N+1.** Load the set, then join or batch. A service looping over products and calling a
  repository per item is a defect, not a style choice.
- **Transactions for related writes** where partial completion would violate integrity — a
  comment plus its counter, a status change plus its history row.
- **Use the Neon HTTP driver** for ordinary request/response queries. WebSockets only where
  interactive transaction behaviour genuinely requires it — `docs/ARCHITECTURE.md` §2.
- **Raw `sql` templates are the injection surface.** Drizzle's builder parameterises; a raw
  template with interpolated user input does not.

## Expand, migrate, contract

Never do a destructive schema change in one step. `docs/DEPLOYMENT.md` §9 requires this
sequence, and each phase ships and is verified separately:

```
EXPAND    add the new column/table/index, nullable or defaulted; deploy; old code still works
MIGRATE   backfill data; dual-write from application code; verify counts match
CONTRACT  drop the old column/constraint only after the new path is confirmed in production
```

A rename is a drop plus an add. It gets all three phases.

## Migration rules

**One migration per logical change.** A migration that adds a table, alters two others, and
backfills is three migrations.

**Never edit an applied migration.** Once it has run in preview or production it is immutable.
Fix forward.

**Every migration has a stated recovery path.** Either a tested down migration, or a written
recovery procedure in the PR description — `docs/ENGINEERING.md` §1.8.

**Enum changes are additive**, or they take a full expand/contract cycle. PostgreSQL cannot
remove an enum value in place.

**Always read the generated SQL.** Drizzle infers renames and drops from schema diffs, and an
inferred `DROP COLUMN` is exactly the mistake this skill exists to prevent.

```bash
pnpm drizzle-kit generate     # produce SQL from schema changes; read it before applying
pnpm drizzle-kit migrate      # apply to a Neon development branch
```

Use a Neon development branch. **Never point a migration at production from a local machine.**

## Growth-sensitive tables

Two tables grow without bound and must ship their retention policy in the creating migration:

- **`referral_events`** — one row per outbound click, and the table that fills a 0.5 GB plan.
  Required from day one (ADR-018): a raw retention window of 30 days, a daily rollup table, and
  the Cloudflare Cron Trigger that rolls up and prunes. Dashboards read the rollup, never the
  raw events.
- **`product_status_history`** — append-only by design, and that is correct. Keep the row
  narrow; never widen it with denormalised product fields.

Comments and waitlist entries grow with real usage and are fine unbounded — but every read of
them is cursor-paginated.

## Checks

```bash
# foreign keys without an explicit delete policy
grep -rn "references(" src/db/schema/ 2>/dev/null | grep -v "onDelete"

# raw SQL with interpolation
grep -rn "sql\`" src/ 2>/dev/null

# offset pagination
grep -rn "\.offset(" src/ 2>/dev/null

# unreviewed destructive statements in generated migrations
grep -rniE "drop (column|table)|rename" drizzle/migrations/ 2>/dev/null
```

## Common mistakes

- Generating a migration and applying it without reading the SQL.
- Adding an index for a query nobody has written yet.
- A `text` column where an enum or a foreign key belongs, "for flexibility".
- Storing a timestamp without a timezone, or in local time.
- Soft-deleting a user and leaving their email address reachable.
- Counting raw `referral_events` at render time instead of reading the rollup.
- Creating a table without deciding, in the same PR, how rows leave it.
- Backfilling in one statement over a large table on a serverless plan — batch it.

## Verification expectations

- The generated SQL was read line by line, and every destructive statement is intentional.
- The migration ran against a Neon **development branch** and the result was inspected.
- Row counts before and after a backfill match expectation, and the check is recorded.
- `EXPLAIN ANALYZE` output exists for every new index, quoted in the PR.
- New personal-data columns appear in `docs/LEGAL.md` §5 in the same diff.

## Exit criteria

```
[ ] one logical change
[ ] expand/migrate/contract phase identified and stated
[ ] down migration written, or recovery path documented in the PR
[ ] generated SQL read; no unreviewed DROP or RENAME
[ ] every FK has an explicit ON DELETE / ON UPDATE policy
[ ] every new index justified by a specific query, with the plan checked
[ ] no unbounded table without a retention or rollup policy
[ ] every list read is cursor-paginated
[ ] new personal-data columns added to the docs/LEGAL.md §5 retention matrix
[ ] enum changes additive, or a full expand/contract cycle
[ ] tested against a Neon development branch, never production
[ ] docs/ARCHITECTURE.md content model updated if entities changed
```

Run the `architecture-reviewer` and `security-reviewer` agents on any schema change —
[`docs/AI-WORKFLOW.md`](../../../docs/AI-WORKFLOW.md#4-agent-routing).
