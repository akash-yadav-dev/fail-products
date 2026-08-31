# FailProducts — Open Source and Contributing Rules

## 1. Open-source model

FailProducts is designed as an open-source project with a hosted public directory.

The open-source repository contains the application and core product logic.

The hosted FailProducts deployment is operated as the canonical public instance.

No paid features are part of the MVP.

## 2. License

Confirmed in ADR-015:

- **Application code:** AGPL-3.0-only — see [`LICENSE`](../LICENSE).
- **Documentation:** CC BY 4.0.
- **Name and logo:** reserved, and excluded from the code license — see
  [`TRADEMARK.md`](../TRADEMARK.md).

AGPL reduces the chance that someone takes the full hosted application, modifies it, and
quietly runs a competing closed hosted version without sharing those modifications. The
trademark carve-out is what stops such a fork from also *calling itself* FailProducts.

This is a product and engineering position, not legal advice.

## 3. Developer Certificate of Origin

Every commit must be signed off:

```bash
git commit -s -m "fix: prevent duplicate waitlist signups"
```

This appends a `Signed-off-by:` line certifying the
[Developer Certificate of Origin](https://developercertificate.org/) — that you wrote the
contribution or have the right to submit it under AGPL-3.0-only.

There is **no CLA**. Contribution friction stays low, and the consequence is accepted
knowingly: without one, the project cannot be relicensed or dual-licensed later without every
contributor's agreement. See [`LEGAL.md`](./LEGAL.md) §8.

Do not add `Co-Authored-By` trailers for AI tools, or generated-with footers. Commits are
authored by the person accountable for the change. This is enforced by the versioned hooks in
[`.githooks/`](../.githooks/), installed by `scripts/setup-git-identity.sh`.

## 4. No contributor bureaucracy for MVP

Do not introduce a CLA, steering committee, plugin marketplace, or formal governance system at MVP stage.

Use:

- GitHub issues;
- pull requests;
- code review;
- a clear CODE_OF_CONDUCT;
- DCO sign-off;
- conventional commit messages only if they help the project.

Keep contribution friction low.

## 5. What contributors can improve

Good contribution areas:

- bug fixes;
- accessibility;
- performance;
- tests;
- docs;
- UI improvements using shadcn/ui;
- product integrations;
- search relevance;
- moderation improvements;
- deployment compatibility.

## 6. What requires maintainer discussion first

Open an issue before large PRs for:

- database schema changes that affect existing data;
- changes to authentication;
- new third-party providers;
- new infrastructure services;
- breaking API changes;
- major UI redesigns;
- changes to moderation rules;
- collection of new categories of user data.

## 7. Branching

Use a small workflow:

```text
main
  ↑
feature/fix branch
  ↓
PR
  ↓
review + checks
  ↓
merge
```

`main` is protected. Nobody pushes to it directly — not contributors, not the maintainer, not
automated tooling. Every change arrives through a reviewed pull request with passing checks.
The exact settings are in [`.github/BRANCH-PROTECTION.md`](../.github/BRANCH-PROTECTION.md).

Do not maintain long-lived release branches in MVP.

## 8. Pull request expectations

Every PR should answer:

- What changed?
- Why is it needed?
- What user behavior changes?
- How was it tested?
- Does it affect performance/security/database schema?

PRs should be focused.

## 9. Code review principles

Review for:

1. correctness;
2. security;
3. maintainability;
4. performance;
5. consistency with the architecture;
6. accessibility.

Do not block good contributions over personal code style when automated formatting/linting already handles it.

## 10. Contributor setup

The README should make this path obvious:

```text
clone repository
→ install pnpm dependencies
→ copy .env.example
→ create local database / use development Neon branch
→ run migrations
→ start Next.js development server
→ run tests
```

Do not require Cloudflare production credentials just to work on ordinary UI or domain logic.

## 11. Local development independence

Contributors should be able to work on:

- public pages;
- components;
- validation;
- domain logic;
- most DB queries;

without access to production Cloudflare or ZeptoMail accounts.

Use mock/dev adapters when needed.

## 12. Commit conventions

Optional but recommended:

```text
feat: add product submission flow
fix: prevent duplicate waitlist signups
docs: improve contribution guide
refactor: isolate referral service
perf: reduce product feed queries
security: validate image upload type
```

## 13. Issue labels

Keep labels small:

- bug
- feature
- docs
- security
- performance
- accessibility
- good-first-issue
- help-wanted
- question
- breaking-change

## 14. Maintainer principle

The maintainer should prefer merging a small, understandable change over accepting a large abstraction that is “more scalable” in theory.

Scalability must be earned by real usage.
