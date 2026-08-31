# FailProducts Documentation

FailProducts is an open-source directory for apps, SaaS products, tools, and projects that have low/no traction, are struggling, are abandoned, or have otherwise failed to gain meaningful usage.

The goal is not to shame founders. The goal is to make failure discoverable, discussable, and useful.

A product may be listed while it is still live. A product can also leave the directory when it demonstrates a meaningful comeback.

## Documentation map

- [Product Requirements](./PRODUCT.md) — product vision, users, MVP scope, workflows, acceptance criteria.
- [Architecture](./ARCHITECTURE.md) — technical architecture, scalability principles, runtime boundaries, data flow.
- [Code Structure](./CODE-STRUCTURE.md) — repository structure and where code belongs.
- [Engineering Rules](./ENGINEERING.md) — coding, dependency, performance, database, API, and testing standards.
- [Design System](./DESIGN.md) — shadcn/ui, Inter, spacing, color hierarchy, accessibility, and UI rules.
- [Open Source & Contributing](./CONTRIBUTING.md) — contribution rules, PRs, issues, branching, and ownership boundaries.
- [Moderation & Community](./MODERATION.md) — submission rules, comments, abuse handling, privacy, and anti-harassment policy.
- [Security](./SECURITY.md) — security requirements and sensitive-data boundaries.
- [Legal & Data Lifecycle](./LEGAL.md) — listing rights, claim framing, retention matrix, data subject requests, licensing.
- [Deployment](./DEPLOYMENT.md) — Cloudflare Workers deployment, environments, secrets, and operations.
- [AI Development System](./AI-DEVELOPMENT.md) — the agents, skills, and MCP servers; commit identity; how to extend the system.
- [AI Workflow](./AI-WORKFLOW.md) — how a task becomes a merged PR: classification, review routing, the complexity gate, and the pre-push verification layer.
- [Verification Reference](./AI-VERIFICATION.md) — the three verification levels, impact radius, severity and confidence, decision rules, report format.
- [Verification Flow](./AI-VERIFICATION-FLOW.md) — the pipeline lifecycle, with worked examples at four risk levels.
- [Roadmap](./ROADMAP.md) — MVP milestones and post-MVP evolution.
- [Architecture Decisions](./DECISIONS.md) — important decisions and why they were made.

## Status

This documentation describes the planned MVP and the architectural guardrails to use before implementation begins.

An architecture review on 2026-08-31 added ADR-012 through ADR-022. Four of those change
requirements stated elsewhere in these documents, and are the current position wherever an
older passage disagrees:

- **Listings are owner-only** (ADR-012) — only a product's founder may publish it. Third-party
  listings are Post-MVP and require the system described in [Legal](./LEGAL.md) §2.
- **Publication state, moderation state, and failure status are three separate columns**
  (ADR-013), not one status pipeline.
- **Authentication is passwordless** (ADR-014) — email OTP / magic link plus GitHub OAuth.
- **Cloudflare Workers Paid is the deployment baseline** (ADR-016) — the Free plan's 10 ms CPU
  limit cannot render server components reliably.
