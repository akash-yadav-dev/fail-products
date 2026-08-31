---
name: dependency-gate
description: Run the mandatory review before adding, replacing, or upgrading an npm dependency. Use whenever a package is about to be installed, whenever a PR adds a line to package.json, and before any major-version upgrade of Next.js, vinext, Drizzle, or the Neon driver. Enforces docs/ENGINEERING.md section 13 and Cloudflare Workers compatibility.
---

# Dependency gate

Every dependency is a permanent obligation on a solo-maintained, public, open-source project:
a supply-chain surface, a bundle-size cost, an upgrade treadmill, and one more thing a
contributor must understand. Most proposed dependencies should not be added.

## Gate 1 — Is it needed at all?

Answer all of these before looking at any package:

- Which MVP requirement in `docs/PRODUCT.md` does this serve? Name it.
- Does the platform already solve it? Check first: the Web Platform (`URL`, `Intl`,
  `crypto.subtle`, `structuredClone`, `AbortController`), Next.js built-ins (metadata, image,
  font, caching), PostgreSQL (full-text search, `pg_trgm`, JSON, generated columns), Cloudflare
  (Turnstile, rate-limit binding, WAF, cache).
- Would 20 to 50 lines of readable code replace it? `docs/ARCHITECTURE.md` §12 says prefer
  that. Small utility packages almost always lose this test.
- Is it in the expected dependency families listed in `docs/ARCHITECTURE.md` §12? Anything
  outside that list needs a stronger justification.

If the honest answer is "it would be convenient", stop. That is a no.

## Gate 2 — Cloudflare Workers compatibility

This is where most otherwise-good packages fail. `vinext` restricts Node APIs harder than a
Node server does, and failures often appear only at deploy time.

Check, in order:

```bash
# Node built-ins that will not exist in the Workers runtime
npm view <pkg> dependencies
grep -rE "require\(['\"](fs|path|net|tls|dns|child_process|worker_threads|http|https|zlib|stream)" node_modules/<pkg>/ 2>/dev/null | head

# Native compilation is an automatic rejection
npm view <pkg> gypfile scripts

# Does it ship a browser or edge/worker build?
npm view <pkg> exports main module browser
```

Automatic rejections:

- native/N-API modules (`sharp`, `bcrypt`, `argon2`, anything with `binding.gyp`)
- packages requiring `fs`, `child_process`, `net`, `tls`, or `dns` on a request path
- packages depending on a full Node `crypto` implementation rather than Web Crypto
- packages with install scripts that build binaries

If the package is otherwise essential and fails here, the answer is an architectural change,
not a polyfill. Move the work to the client, to a build step, or to a provider.

## Gate 3 — Supply chain

This is a public repository; a compromised transitive dependency is a compromised
production deployment.

```bash
npm view <pkg> version time.modified maintainers license
npm view <pkg> dist.unpackedSize
npm ls <pkg> --all 2>/dev/null | wc -l    # transitive footprint
npm audit --omit=dev
```

Reject or escalate on:

- unmaintained — no release in roughly 18 months with open security issues
- a licence incompatible with AGPL-3.0-only distribution
- a single unknown maintainer on a package with a large dependent tree
- a deep transitive tree for a shallow problem
- a recent ownership transfer or a suspicious version jump
- any postinstall script

## Gate 4 — Cost

- Bundle impact on the Workers script size and on client JS for public pages. Public pages
  must stay light — `docs/ENGINEERING.md` §7.
- CPU cost per request. On Workers, CPU is billed and capped.
- Does it pull in a runtime that duplicates something already bundled?

## Gate 5 — Contributor legibility

`docs/ENGINEERING.md` §13 asks: will a contributor understand why this exists? If the package
solves a problem that is invisible from the code that uses it, document the reason next to the
import, not in a commit message.

## Decision

Record the outcome:

- **Approved** — add it, pin an exact version, and note the reason in the PR description.
  If it is a new provider or a new capability class, it also needs an ADR (use the `adr` skill).
- **Approved with constraint** — allowed only in a specific layer. `integrations/` and build
  tooling can carry things a request path cannot.
- **Rejected — replaceable** — write the small implementation instead.
- **Rejected — incompatible** — state the Workers constraint that killed it.
- **Deferred** — legitimate but not for MVP. Name the signal that would change the answer.

## Upgrades

Major-version upgrades of Next.js, vinext, Drizzle, or the Neon driver follow
`docs/DEPLOYMENT.md` §13:

```
review release notes -> check Cloudflare/vinext compatibility -> run the full test suite
  -> deploy preview -> verify public pages, auth, and mutations -> production
```

Security patches are the exception: apply promptly, verify after. Next.js 16.3.3 is the
current Active LTS baseline and carries the August 2026 critical fixes — do not regress below it.
