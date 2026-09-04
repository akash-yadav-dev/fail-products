# FailProducts — Repository and Code Structure

The repository is intentionally a single application, not a monorepo, for the MVP.

The code should be modular internally without creating package-management overhead.

## Recommended structure

```text
failproducts/
├── .github/
│   ├── workflows/
│   ├── ISSUE_TEMPLATE/
│   ├── BRANCH-PROTECTION.md
│   ├── CODEOWNERS
│   └── PULL_REQUEST_TEMPLATE.md
│
├── .githooks/                   # versioned; installed via core.hooksPath
│   ├── commit-msg               # strips AI attribution, blocks private emails
│   ├── pre-commit               # blocks secrets and .env files
│   └── pre-push                 # runs the verification gate; refuses pushes to main
│
├── .claude/                     # committed: public review standards
│   ├── agents/                  # architecture-reviewer, security-reviewer, performance-reviewer,
│   │                            # product-quality-reviewer, release-verifier, scope-skeptic,
│   │                            # impact-analyzer, verification-orchestrator
│   └── skills/                  # architecture, database, ui, performance, security, testing,
│                                # adr, dependency-gate, pre-push-verify, pre-merge-verify,
│                                # release-check
│
├── mcp/                         # committed: MCP servers and their permission model
│   ├── README.md
│   └── examples/                # placeholder names only, never values
│
├── docs/
│   ├── README.md
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   ├── CODE-STRUCTURE.md
│   ├── ENGINEERING.md
│   ├── DESIGN.md
│   ├── CONTRIBUTING.md
│   ├── MODERATION.md
│   ├── SECURITY.md
│   ├── LEGAL.md
│   ├── AI-DEVELOPMENT.md
│   ├── AI-WORKFLOW.md
│   ├── DEPLOYMENT.md
│   ├── ROADMAP.md
│   └── DECISIONS.md
│
├── public/
│   ├── brand/                   # logo, wordmark — see TRADEMARK.md
│   ├── favicon/
│   └── static-assets/
│
├── src/
│   ├── app/
│   │   ├── (site)/              # public surface: shares the header and footer
│   │   │   ├── (marketing)/
│   │   │   ├── products/
│   │   │   ├── categories/
│   │   │   ├── status/
│   │   │   ├── u/
│   │   │   ├── auth/
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/         # creator surface: its own sidebar shell
│   │   ├── api/
│   │   ├── layout.tsx           # providers only, no page furniture
│   │   ├── not-found.tsx
│   │   ├── error.tsx
│   │   ├── global-error.tsx
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── ui/                  # shadcn/ui generated components
│   │   ├── layout/
│   │   ├── products/
│   │   ├── comments/
│   │   ├── waitlist/
│   │   ├── dashboard/
│   │   ├── security/            # Turnstile widget; cross-cutting, not a domain
│   │   └── shared/
│   │
│   ├── domain/
│   │   ├── product/            # failure-status, slug, transitions, permissions
│   │   ├── user/               # username
│   │   ├── shared/             # reserved-names, shared by all four namespaces
│   │   ├── comment/
│   │   ├── waitlist/
│   │   ├── moderation/
│   │   └── referral/
│   │
│   ├── services/               # one directory per domain, not one file —
│   │                           # except security/, which is cross-cutting
│   │   ├── auth/
│   │   │   ├── auth-service.ts     # use cases; the repository is injected
│   │   │   └── server-auth.ts      # binds them to getDb() for the app
│   │   ├── product/
│   │   ├── user/
│   │   ├── comment/
│   │   ├── waitlist/
│   │   ├── moderation/
│   │   ├── security/               # rate-limit, turnstile; used by several domains
│   │   └── referral/
│   │
│   ├── repositories/
│   │   ├── product-repository.ts
│   │   ├── user-repository.ts
│   │   ├── comment-repository.ts
│   │   ├── waitlist-repository.ts
│   │   └── ...
│   │
│   ├── db/
│   │   ├── schema/
│   │   │   ├── users.ts
│   │   │   ├── products.ts
│   │   │   ├── comments.ts
│   │   │   ├── moderation.ts       # reports, comment_status_history
│   │   │   ├── security.ts         # rate_limits
│   │   │   ├── waitlists.ts
│   │   │   └── referrals.ts
│   │   ├── index.ts
│   │   └── queries/
│   │
│   ├── integrations/
│   │   ├── zeptomail/
│   │   ├── github/
│   │   ├── cloudflare/
│   │   └── analytics/
│   │
│   ├── lib/
│   │   ├── auth/
│   │   ├── config/
│   │   ├── csv/                 # escaping and formula neutralisation for exports
│   │   ├── forms/               # the shape a Server Action returns to a form
│   │   ├── ids/
│   │   ├── validation/          # url, email — shared by domain/ and services/
│   │   ├── urls/
│   │   ├── security/
│   │   └── utils/
│   │
│   ├── hooks/
│   └── types/
│
├── drizzle/
│   └── migrations/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── scripts/
│   ├── setup-git-identity.sh
│   ├── setup-git-identity.ps1
│   ├── verify-changes.sh        # the gate: what changed, impact radius, is it safe?
│   ├── verify-changes.ps1
│   ├── test-verify-changes.sh   # regression tests for the gate's own guards
│   ├── load-env.mjs             # .env.local for tooling Next.js does not cover
│   └── require-database.mjs     # makes `pnpm test:integration` fail, not skip
│
├── .env.example                 # names only, never values
├── .nvmrc                       # Node version, read by CI and by nvm
├── components.json
├── drizzle.config.ts
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml          # pnpm settings, not a monorepo declaration
├── postcss.config.mjs
├── tsconfig.json
├── wrangler.jsonc
├── AGENTS.md                    # engineering constraints for every agent and tool
├── CLAUDE.md                    # repository governance: identity, branches, secrets
├── LICENSE                      # AGPL-3.0-only
├── TRADEMARK.md                 # name and logo carve-out
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── README.md
```

Tailwind v4 is configured from `src/app/globals.css` with `@theme`, so there is no
`tailwind.config.*` file.

## Route groups

`(site)` and `(dashboard)` are route groups, so neither appears in a URL —
`src/app/(site)/products/page.tsx` is still `/products`. They exist to split the two
surfaces by the chrome they carry:

| Group | Layout | Chrome |
|---|---|---|
| `(site)` | `app/(site)/layout.tsx` | `SiteHeader`, `<main>`, `SiteFooter` |
| `(dashboard)` | `app/(dashboard)/dashboard/layout.tsx` | sidebar shell, dashboard header |

The root layout carries **providers only** — theme, tooltip, toaster — and no header or
footer. Putting the marketing chrome there would force it onto the dashboard, which is a
different application surface with its own navigation.

`not-found.tsx`, `error.tsx`, and `global-error.tsx` sit at the root because they must
catch every segment, and so they render whatever chrome they need themselves.

## Ownership rule

Each folder should have one obvious responsibility.

- `app/` — route composition and page rendering.
- `components/` — UI.
- `domain/` — business rules.
- `services/` — application use cases.
- `repositories/` — data access.
- `db/` — schema/migrations/query primitives.
- `integrations/` — third-party services.
- `lib/` — cross-cutting infrastructure helpers.

## Dependency direction

Allowed:

```text
app → components → services/domain
app → services
services → domain
services → repositories
repositories → db
integrations → external providers
```

Avoid:

```text
components → db
components → ZeptoMail
components → GitHub API
 domain → Next.js
 domain → Cloudflare
```

## API organization

Use resource-oriented route handlers under `src/app/api`.

Examples:

```text
/api/products
/api/products/[id]
/api/products/[id]/comments
/api/products/[id]/waitlist
/api/products/[id]/referrals
/api/users/me
/api/reports
```

Do not create `/api/doEverything` style endpoints.

## Component rules

`components/ui/` contains shadcn/ui-generated components and should stay close to upstream structure.

Do not edit generated primitives unless there is a strong reason.

Product-specific composition belongs in `components/products/`.

## Naming

- React components: PascalCase.
- Functions/variables: camelCase.
- Database tables: snake_case.
- Routes: lowercase kebab-case where needed.
- Domain entities: singular names.
- Boolean fields: `is_*`, `has_*`, `can_*`.

## File size

Prefer focused modules. A file over roughly 300–400 lines should trigger a review of responsibilities, not an automatic refactor.

Do not split code merely to reduce line count.

## Comments

Comments should explain why, not what.

Bad:

```ts
// Set status to published
product.status = "PUBLISHED";
```

Good:

```ts
// Publication is explicit so moderation can audit when public visibility began.
product.status = "PUBLISHED";
```
