---
name: security
description: Build securely against this application's threat model. Use when writing or changing authentication, sessions, authorization, any mutation or API route, input validation, user-generated content rendering, URL handling, file uploads, rate limiting, email, or anything touching secrets and personal data. Enforces docs/SECURITY.md.
---

# Security

## Purpose

Rules for **building** securely here. The `security-reviewer` agent audits against
`docs/SECURITY.md`; this skill is what you follow so the audit finds nothing.

## When to use it

Whenever you touch: authentication, sessions, authorization, a mutation, an API route, input
validation, rendering of user content, external URLs, file uploads, rate limiting, email,
secrets, or personal data. In practice, most features.

## Context you need first

- `docs/SECURITY.md` — the requirement list, in full
- `docs/ENGINEERING.md` §8 security coding rules, §6 the mutation pipeline
- `docs/LEGAL.md` §5 retention matrix, `docs/MODERATION.md` abuse policy
- `docs/DECISIONS.md` — ADR-014 (passwordless), ADR-017 (layered rate limiting), ADR-020 (uploads)

## The threat model — why this app is unusual

Three properties compound, and every rule below comes from one of them:

1. **It hosts adversarial content about named real businesses.** The content *is* the attack
   surface. Stored XSS, defamation, and doxxing are the expected traffic, not the edge case.
2. **It is a fully public repository.** A leaked Neon connection string is a total compromise
   with no revocation delay.
3. **It runs on metered infrastructure.** Abuse is a *billing* attack as well as an availability
   one. An unauthenticated endpoint that triggers a query is a cost vulnerability.

## Verify, never assume

`AGENTS.md` §3 applies hardest here. Security is the domain where a plausible assumption does
the most damage, because it reads exactly like a decision.

- **Never rely on a framework default you have not confirmed in this codebase.** Server Actions
  carry CSRF protection — verify it is not disabled rather than assuming the version behaves as
  you remember.
- **Never assume a library sanitises.** Read its configuration. Most Markdown renderers allow
  raw HTML until told not to.
- **Check provider behaviour against primary documentation, dated.** Cloudflare, Neon, and
  ZeptoMail defaults change, and controls that lean on a default are only as good as today's.
- **If you are unsure whether something is safe, it is not safe yet.** Escalate. Never ship a
  guess in an auth, authorization, upload, or personal-data path.

## Rules

### The mutation pipeline — every mutation, no exceptions

```
parse → validate → authenticate → authorize → rate-limit → domain use case → persist → safe response
```

Skipping a stage because "this endpoint is harmless" is how the harmless endpoint becomes the
way in.

### Authentication — passwordless (ADR-014)

No stored passwords, which removes one bug class and adds another:

- Tokens from a CSPRNG — `crypto.getRandomValues`. **Never `Math.random`.**
- **Single-use and short-lived**, consumed **atomically**. A read-then-delete race is a replay.
- **Constant-time comparison.** A `===` on a secret is a timing leak.
- **Hashed at rest**, so database read access does not yield working login links.
- **Attempt limits per identifier *and* per IP.** A 6-digit OTP without a cap is brute-forceable
  in minutes.
- **No account enumeration.** "Email exists" and "does not exist" must be indistinguishable in
  both response and timing.
- Magic links must not leak via `Referer` — check redirect targets and any third-party script on
  the verification page.
- OAuth: verify `state`, use PKCE where applicable, allowlist `redirect_uri` exactly. Never
  accept a `next` or `returnTo` without validating it against a same-origin allowlist.

Email is on the **critical path for login** here, not just notifications.

### Sessions

`HttpOnly`, `Secure` in production, `SameSite=Lax` minimum, scoped `Path`, explicit `Max-Age`.
Rotate on privilege change; invalidate server-side on logout and account deletion — clearing the
cookie is not logout.

### Authorization — where the real bug will be

- **Re-load the resource server-side and check against the session.** Never against a
  client-supplied field.
- **Mass assignment:** Zod schemas are explicit allowlists. Never `.passthrough()`. `status`,
  `ownerId`, `moderationState`, `isVerified`, `createdAt`, and every counter must be strippable
  from client input.
- **IDOR:** every route under `/api/products/[id]/*`, `/api/users/*`, waitlist export, and
  moderation scopes by owner or moderator role.
- **Waitlist CSV export is a bulk-PII endpoint.** Ownership check, rate limit, and an audit log
  entry.
- **Listings are owner-only** (ADR-012). Only a product's founder may publish it.

### User-generated content

- Render as plain text or **sanitised Markdown**. `dangerouslySetInnerHTML` over user input is a
  blocker.
- Configure the Markdown renderer to **disable raw HTML** and forbid `javascript:`, `data:`, and
  `vbscript:` in links and images.
- Escape in the less obvious fields too: product name, slug, username, bio, category label, tag,
  report reason, and anything echoed into a page title or Open Graph tag.
- **CSV injection:** any waitlist export cell beginning with `=`, `+`, `-`, `@`, tab, or CR is
  neutralised. Formula execution on a founder's machine is a real consequence of an unescaped
  email field.
- **Email templates:** escape user content in HTML bodies; reject CR/LF in any header value
  (subject, reply-to).

### URLs

Creator website, payment link, GitHub URL, social links: **`http` and `https` only.** Reject
`javascript:`, `data:`, `file:`, `blob:`, and protocol-relative `//host`.

Normalise before storing and **re-validate before rendering** — write-time validation alone
fails the moment data arrives another way. External links carry `rel="noopener noreferrer"`.
Validate any parameter that determines a redirect destination.

### SSRF

`docs/SECURITY.md` §6 says avoid server-side fetching in MVP. If it is genuinely needed, it
requires **all** of: protocol allowlist, private/loopback/link-local/metadata IP blocking
(including `169.254.169.254` and IPv6 equivalents), redirect re-validation at every hop,
timeout, response size cap, content-type check, and DNS-rebinding mitigation. Anything less is
not shippable.

### Uploads and R2

- Images only, validated by **magic bytes** — not extension, not client `Content-Type`.
- Size cap enforced **server-side**.
- Object keys generated server-side from a CSPRNG. Never interpolate a user filename.
- Signed upload URLs narrowly scoped and short-lived.
- Served with a restrictive `Content-Type` and `Content-Disposition`, from an origin that does
  **not** share cookies with the app.
- **SVG is a stored-XSS vector.** Reject it, or rasterise it.

### Rate limiting — layered (ADR-017)

Use the right layer; the wrong one is itself a finding:

| Layer | Use for | Not for |
|---|---|---|
| Cloudflare WAF rules | Floods, before Workers bill | Precise per-user limits |
| Workers `ratelimit` binding | Cost control | **Login or token verification** — it is eventually consistent and per-colocation |
| Database / Durable Object counters | Anywhere an accurate global count matters | Cheap coarse limits |
| Turnstile | Unauthenticated and abuse-prone forms | A substitute for a rate limit |

Turnstile tokens are verified **server-side** against siteverify, the response is checked for
success, and tokens are not replayable.

### Secrets and personal data

- Never in the repository. `.env.example` holds **names only**.
- Never in logs: tokens, magic links, session ids, OTP codes, full request bodies.
- No raw IP addresses without a documented purpose and retention period.
- New personal-data fields go into the `docs/LEGAL.md` §5 retention matrix in the same PR.
- Deletion actually erases or anonymises. A soft-deleted row holding an email does not satisfy a
  deletion request.

### Workers runtime

- No Node-only APIs on a request path — `fs`, `net`, `child_process`, native crypto KDFs.
- `env` bindings never serialised into a client component or a server-rendered payload.
- **No module-level mutable state for security decisions.** Isolates are shared and recycled, so
  an in-memory counter or cache is both incorrect and a cross-request leak.
- Error responses leak no stack traces, SQL, or binding names.

## Checks

```bash
grep -rn "dangerouslySetInnerHTML" src/ 2>/dev/null
grep -rn "Math\.random" src/ 2>/dev/null
grep -rn "passthrough()\|\.any()\|z\.unknown()" src/ 2>/dev/null
grep -rn "sql\`" src/ 2>/dev/null
grep -rniE "(api[_-]?key|secret|token|password)\s*[:=]\s*['\"]" src/ 2>/dev/null
grep -rn "http://\|javascript:" src/ 2>/dev/null
git diff --cached --name-only | grep -E "^\.env" 2>/dev/null
```

## Common mistakes

- Trusting a client-supplied `ownerId` because the UI only ever sends the right one.
- A Zod schema that validates shape but passes through unexpected keys.
- Rate limiting the form but not the API route behind it.
- Validating a URL on write and rendering it unchecked later.
- Using the Workers rate-limit binding as the only control on OTP verification.
- Logging the full request body "temporarily" for debugging.
- Accepting SVG because it is an image format.
- Sanitising on render *and* on write inconsistently, so one path misses.

## Verification expectations

- Trace untrusted input to its sink for anything you claim is safe. Reachability is the standard.
- Every control was **read in this codebase**, not assumed from the framework's reputation.
- Provider-dependent controls carry the date you verified the provider's behaviour.
- State three things separately and never merge them: **verified**, **not verified**,
  **potential risk**.

## Exit criteria

```
[ ] every mutation runs the full pipeline, including the rate limit
[ ] authorization re-loads server-side and checks the session
[ ] Zod schemas are explicit allowlists; no passthrough
[ ] user content escaped at render; no dangerouslySetInnerHTML over user input
[ ] external URLs protocol-validated at write and at render
[ ] uploads validated by magic bytes, size-capped server-side, keys server-generated
[ ] tokens CSPRNG, hashed, single-use, atomically consumed, constant-time compared
[ ] no secrets, .env files, or private email addresses in the diff
[ ] no Node-only API and no module-level mutable security state
[ ] new personal-data fields added to docs/LEGAL.md §5
[ ] error responses leak nothing
```

Run the `security-reviewer` agent on the diff — [`docs/AI-WORKFLOW.md`](../../../docs/AI-WORKFLOW.md#4-agent-routing).
Never weaken a control to make a test pass.
