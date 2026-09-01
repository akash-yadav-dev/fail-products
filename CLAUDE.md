# FailProducts — Agent Operating Rules

These rules bind **every** agent, session, and automated tool that touches this repository,
including parallel agents and non-Claude tooling. They override default behaviour.

This file carries **repository governance**. [`AGENTS.md`](AGENTS.md) carries the **engineering
constraints** — including the rule that nothing verifiable may be assumed. Read both; neither
overrides the other.

This is a **public, open-source repository**. Assume everything committed is permanent and world-readable.

---

## 1. Commit identity — non-negotiable

All commits, tags, and PRs are authored by the project owner. No agent attribution.

```
Author: Akash Yadav <180740493+akash-yadav-dev@users.noreply.github.com>
```

Run once per clone, before the first commit:

```bash
bash scripts/setup-git-identity.sh     # macOS / Linux / Git Bash
pwsh scripts/setup-git-identity.ps1    # Windows PowerShell
```

This sets repo-local `user.name` / `user.email` and installs `core.hooksPath=.githooks`,
which strips agent attribution automatically.

**Forbidden in every commit message, tag, and PR body:**

- `Co-Authored-By:` lines naming Claude, Copilot, Cursor, or any AI tool
- `Generated with Claude Code` / `Generated with <tool>` footers
- 🤖 attribution emoji footers
- Any email address other than the GitHub noreply address above

That last rule is an **allowlist, not a blocklist** — the noreply address is the only one
permitted anywhere in this repository. Naming the addresses to block would publish them, which
is exactly what this rule exists to prevent. That includes whatever address your global git
config happens to hold; the setup script overrides it per-repo so it never reaches a commit.

## 2. Branch protection

`main` is protected. No agent pushes to `main` directly, ever.

```
feature/* | fix/* | docs/* | security/*
        ↓
        PR
        ↓
  owner review + approval        <- required, cannot be self-bypassed by an agent
        ↓
      status checks pass
        ↓
      merge to main
```

Agents open PRs. Agents do not approve, merge, or force-push. Configuration lives in
[`.github/BRANCH-PROTECTION.md`](.github/BRANCH-PROTECTION.md).

**Verify before every push:**

```bash
bash scripts/verify-changes.sh     # or: pwsh scripts/verify-changes.ps1
```

This runs automatically via `.githooks/pre-push` and again in CI. It reports what changed and
blocks secrets, private email addresses, unsigned commits, AI attribution, modified migrations,
and any push to `main`. Never bypass it with `--no-verify` to make a push succeed — a bypass is
the maintainer's decision and is recorded in the PR. See the `pre-push-verify` skill.

## 3. Contributor provenance

Every commit is DCO signed-off:

```bash
git commit -s -m "feat: add product submission flow"
```

producing `Signed-off-by: Akash Yadav <180740493+akash-yadav-dev@users.noreply.github.com>`.

## 4. Secrets and personal data

Never commit: credentials, tokens, connection strings, Cloudflare account IDs, Neon
endpoints, ZeptoMail keys, Turnstile secrets, `.env*` files, or real user data.

`.env.example` carries **names only**, never values.

Before any commit touching config, scan the diff for high-entropy strings and provider
key prefixes.

## 5. Documentation is the source of truth

Implementation is underway in [`src/`](src/). Documentation in [`docs/`](docs/) still
defines the system; code must follow it, not the reverse.

- A change that contradicts a doc requires the doc to change **in the same PR**.
- A decision with lasting architectural consequence requires an ADR in
  [`docs/DECISIONS.md`](docs/DECISIONS.md) — use the `adr` skill.
- Never silently diverge from [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) or
  [`docs/CODE-STRUCTURE.md`](docs/CODE-STRUCTURE.md).

## 6. Dependency direction

```
app → components → services → domain
app → services → repositories → db
integrations → external providers
```

`domain/` imports nothing from Next.js, Cloudflare, Neon, React, or ZeptoMail. Ever.

## 7. Scalability is earned, not anticipated

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §10 defines Stages 0–3. The project is at
**Stage 0**. Do not add Redis, queues, search services, read replicas, microservices, or a
monorepo because they might be needed later. Adding Stage 2+ infrastructure requires a
measurement that proves the need.

## 8. Specialised agents

| Agent | Use for |
|---|---|
| `architecture-reviewer` | Structure, module boundaries, dependency direction, unnecessary complexity |
| `security-reviewer` | Security review and remediation |
| `performance-reviewer` | Rendering, queries, caching, bundle, Core Web Vitals |
| `product-quality-reviewer` | User value, UX, tone, community effect, accessibility |
| `release-verifier` | The final go/no-go before a production deploy |
| `scope-skeptic` | Challenging whether work is necessary, required, or proven |
| `impact-analyzer` | Blast radius: consumers, contracts, regressions |
| `verification-orchestrator` | The pre-merge pipeline and the final merge decision |

Skills: `architecture`, `database`, `ui`, `performance`, `security`, `testing`, `adr`,
`dependency-gate`, `pre-push-verify`, `pre-merge-verify`, `release-check`.

Do not run every reviewer on every task — route with
[`docs/AI-WORKFLOW.md`](docs/AI-WORKFLOW.md#4-agent-routing), then escalate by the impact radius
the gate computes.

Full reference: [`docs/AI-DEVELOPMENT.md`](docs/AI-DEVELOPMENT.md).
Verification rules and decision logic: [`docs/AI-VERIFICATION.md`](docs/AI-VERIFICATION.md).

## 9. Confirmed project decisions

Locked in as of 2026-08-31 — do not re-litigate without an ADR:

- **Listings are owner-only.** Only a product's founder/owner may publish it. Third-party
  listings are Post-MVP and require a separate consent + delist system. See
  [`docs/LEGAL.md`](docs/LEGAL.md).
- **Authentication is passwordless** — email OTP / magic link plus GitHub OAuth. No password
  storage, no password reset flow, no native KDF on Workers.
- **License is AGPL-3.0-only**, with the FailProducts name and logo carved out via
  [`TRADEMARK.md`](TRADEMARK.md).
- **Workers Paid plan** is the deployment baseline. The 10 ms CPU limit on the Free plan
  cannot render server components reliably.
