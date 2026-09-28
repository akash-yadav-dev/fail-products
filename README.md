# FailProducts

> Discover products that failed. Learn why. Help them recover.

FailProducts is an open-source directory for apps, SaaS products, tools, and projects that have low/no traction, are struggling, abandoned, or otherwise unsuccessful.

It is designed as a community resource, not a harassment platform.

## Documentation

Start with [`docs/README.md`](./docs/README.md).

## Stack and deployment target

- Next.js + TypeScript
- Neon PostgreSQL
- Drizzle ORM
- shadcn/ui
- Tailwind CSS
- Inter

Cloudflare Workers is the deployment target. CI builds the Worker and maps
`dev` to staging and `main` to production, but the Cloudflare credentials and
live deployment checks remain pending. ZeptoMail and Turnstile adapters exist,
but their production behavior has not been verified. R2 media transport is
also pending. See the
[roadmap](./docs/ROADMAP.md) for the current work and the
[deployment guide](./docs/DEPLOYMENT.md) for the release gate.

## Development philosophy

Keep the MVP free for users, cheap to operate, easy to maintain, and straightforward for contributors to understand.

Avoid premature infrastructure. Earn complexity through real usage.

## Contributing

Read [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) first.

Three things apply to every contribution:

```bash
bash scripts/setup-git-identity.sh   # once per clone — identity + git hooks
git commit -s -m "fix: ..."          # -s adds the required DCO sign-off
bash scripts/verify-changes.sh       # before pushing: what changed, and is it safe?
```

`main` is protected — all changes land through a reviewed pull request.

`verify-changes` is the pre-push gate. It reports what you changed and blocks secrets, private
email addresses, unsigned commits, and pushes to `main`. It runs automatically on `git push`
and again in CI, so a local bypass does not get past the PR. On Windows,
`pwsh scripts/verify-changes.ps1`.

Development standards are enforced by committed agents and procedural skills in
[`.claude/`](./.claude/). They are public on purpose: you can read exactly what your PR will be
reviewed against, and run the same reviews locally.

- [`AGENTS.md`](./AGENTS.md) — the constraints every contributor and AI agent works under
- [`docs/AI-DEVELOPMENT.md`](./docs/AI-DEVELOPMENT.md) — what each agent, skill, and MCP server does
- [`docs/AI-WORKFLOW.md`](./docs/AI-WORKFLOW.md) — the workflow, review routing, and complexity gate

## License

Copyright (C) 2026 Akash Yadav

- **Code:** [AGPL-3.0-only](./LICENSE) (`AGPL-3.0-only`)
- **Documentation:** CC BY 4.0 (`CC-BY-4.0`)
- **Name and logo:** reserved — see [`TRADEMARK.md`](./TRADEMARK.md)

A public deployment must link to its source from the interface — AGPL section 13. Details and
the full notice: [`NOTICE.md`](./NOTICE.md).

Forks are welcome and must rebrand. See [`docs/LEGAL.md`](./docs/LEGAL.md).
