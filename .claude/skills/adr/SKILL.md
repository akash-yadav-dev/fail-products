---
name: adr
description: Write or amend an Architecture Decision Record in docs/DECISIONS.md. Use whenever a choice will be expensive to reverse — picking a provider, changing the data model, adding infrastructure, altering auth, changing the licence or moderation policy, or overriding an existing ADR. Also use when someone asks "why did we do it this way" and the answer is not written down.
---

# Writing an ADR for FailProducts

An ADR exists so that a contributor two years from now — or the owner, after a long gap —
can tell the difference between a considered decision and an accident. Write for that reader.

## When an ADR is required

Required:

- choosing, replacing, or dropping a provider (hosting, database, email, storage, auth)
- a data-model change that affects existing rows or public URLs
- adding infrastructure — a queue, a cache, a search service, a background job runner
- anything touching authentication, authorization, or moderation policy
- licence, trademark, or contribution-policy changes
- overriding or reversing an existing ADR
- adopting a beta or pre-1.0 dependency in a production path

Not required: naming, formatting, component structure, a bug fix, or anything a lint rule
already settles.

## Procedure

1. **Read `docs/DECISIONS.md` first.** Find the highest existing ADR number and check whether
   the decision is already covered. Amending an existing ADR is usually better than adding one.
2. **Check for contradiction.** If the new decision conflicts with an accepted ADR, the old one
   must be marked `Superseded by ADR-nnn` in the same edit. Never leave two ADRs disagreeing.
3. **Verify the facts.** Any claim about a provider's limits, pricing, or capabilities gets
   checked against primary documentation, with the date recorded. Vendor limits move.
4. **Append the new ADR** in the format below, at the end of the file, numbered sequentially.
5. **Propagate.** If the decision changes a rule, update the doc that states that rule in the
   same commit — `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `CLAUDE.md`, whichever applies.

## Format

Match the existing entries in `docs/DECISIONS.md` exactly — short, plain, no ceremony.

```markdown
## ADR-0nn — <decision in a short imperative phrase>

**Status:** Accepted | Superseded by ADR-0nn | Reversed
**Date:** YYYY-MM-DD

### Decision

One or two sentences. What we are doing. Unambiguous enough to be testable.

### Reason

Why this, in the context that actually applied. Include the constraint that drove it —
cost, solo maintenance, Workers runtime, legal exposure, SEO.

### Rejected alternatives

- **<Option>** — why not. One line each.

### Consequences

What this makes easy, what it makes hard, and what new obligation it creates.
State the reversal cost honestly.
```

Include `### Rejected alternatives` whenever a real alternative existed. An ADR that lists no
alternatives reads as a decision nobody thought about.

## Standards

- **Present tense, active voice.** "Use Neon PostgreSQL", not "It was decided that we would".
- **Record the constraint, not just the conclusion.** "Cloudflare Workers Free caps CPU at 10 ms"
  is the useful part; "we chose the paid plan" is the trivia.
- **Date every external fact.** Write "as of 2026-08-31" next to any quoted limit or price.
- **Be honest about weakness.** An ADR that admits the choice may not survive Stage 2 traffic is
  more useful than one that pretends certainty.
- **Never delete an ADR.** Mark it superseded or reversed. The history is the point.

## Guardrails

Some decisions are locked in `CLAUDE.md` §9. Reversing one is legitimate, but it requires a
new ADR that explicitly supersedes the original and states what changed in the world — not
just a change of mind. That applies to owner-only listings, passwordless authentication, the
AGPL-3.0-only licence, and the Workers Paid baseline.
