# FailProducts — Security Requirements

## 1. Security priorities

MVP security priorities:

1. account/session safety;
2. user-generated content safety;
3. abuse/spam prevention;
4. secret protection;
5. safe file uploads;
6. database integrity;
7. safe external links/integrations.

## 2. Authentication

Authentication is **passwordless** (ADR-014): email one-time code / magic link, plus GitHub
OAuth. No passwords are stored, so there is no password store, no reset flow, and no KDF to
tune. The security surface moves entirely onto token handling.

### Sessions

- secure HTTP-only cookie in production;
- appropriate SameSite policy;
- explicit expiration and rotation on privilege change;
- logout invalidates server-side, not only by clearing the cookie;
- full invalidation on account deletion.

### Sign-in tokens — the critical surface

Every property below is required, and each has a specific failure mode:

- generated with `crypto.getRandomValues`, never `Math.random`;
- **single-use**, consumed **atomically** — a read-then-delete race allows replay;
- short-lived: minutes for an OTP, not hours;
- **hashed at rest**, so read access to the database does not yield working sign-in links;
- compared in constant time — `===` on a secret is a timing oracle;
- attempt-capped per identifier **and** per IP; a six-digit OTP without a cap is brute-forceable
  in minutes;
- **no account enumeration** — the response body, status, and timing must be identical whether
  or not the address has an account;
- magic links must not leak through `Referer`; keep third-party scripts off the verification page.

### OAuth

- `state` verified on return, PKCE where supported;
- `redirect_uri` matched against an exact allowlist;
- any `next` / `returnTo` parameter validated against a same-origin allowlist before use.

## 3. Authorization

Every product mutation must verify ownership or moderator privilege on the server.

Never rely on:

```ts
if (clientProduct.ownerId === currentUser.id)
```

unless the server itself has already loaded/verified ownership.

## 4. Input validation

Validate:

- product names;
- descriptions;
- slugs;
- category IDs;
- URLs;
- file metadata;
- comments;
- profile fields;
- waitlist emails.

Use schemas at the boundary.

## 5. XSS

Comments and descriptions must not allow arbitrary HTML by default.

Prefer plain text/Markdown with a controlled renderer.

Sanitize rendered content.

## 6. SSRF

If the platform ever fetches a creator website, GitHub URL, screenshot URL, favicon URL, or analytics URL server-side, treat it as a potential SSRF surface.

Controls must include:

- allowlisted protocols;
- blocked private IP ranges;
- redirect validation;
- request timeout;
- response size limits;
- content-type checks;
- DNS rebinding considerations.

For MVP, avoid server-side fetching unless necessary.

## 7. File uploads

Images are resized in the browser, uploaded directly to R2, and transformed on read (ADR-020).
No image is decoded server-side — `sharp` cannot run on Workers, and the August 2026 Next.js
critical advisory was an unauthenticated RCE reached through AVIF decoding in the image
optimizer.

- Upload directly to R2 when practical.
- **Validate by magic bytes**, never by file extension or the client's `Content-Type`.
- Enforce the size cap **server-side**. Client-side resizing is an optimisation and can be
  bypassed; it is not a control.
- Generate object keys server-side from a CSPRNG. Never interpolate a user filename into a key.
- Keep signed upload URLs narrowly scoped and short-lived.
- Serve with a restrictive `Content-Type` and `Content-Disposition`, from an origin that does
  not share cookies with the application.
- **Reject SVG.** It is a stored-XSS vector, and rasterising it would require the server-side
  decode this design avoids.
- Consider malware scanning later if arbitrary document uploads are ever permitted.

MVP should accept raster images only.

## 8. External links

Only allow `http`/`https` links.

Normalize and validate URLs.

Do not allow javascript/data/file schemes.

External links should use safe browser behavior when opening new tabs.

## 9. GitHub integration

When added:

- use a GitHub App with minimum permissions;
- do not request private repository access unless explicitly needed;
- store installation/reference data, not unnecessary tokens;
- encrypt secrets at rest where applicable;
- allow disconnect/revocation;
- delete integration data when requested.

## 10. Secrets

Never store secrets in:

- Git;
- issue trackers;
- logs;
- screenshots;
- database rows unless encrypted and necessary.

Use Cloudflare secrets/environment variables.

## 11. Rate limits

Rate limiting is **layered** (ADR-017). Picking the wrong layer for a control is itself a
security defect, so each endpoint must name which layer protects it.

| Layer | Properties | Use for |
|---|---|---|
| Cloudflare WAF rate-limiting rules | zone-level, at the edge, before Workers bill | coarse flood protection |
| Workers `ratelimit` binding | permissive, eventually consistent, **per-colocation** | cost control, casual abuse |
| Database / Durable Object counter | accurate, globally consistent, costs a write | anything security-critical |

**In-memory counters do not work on Workers.** Isolates are shared and recycled, so a
module-level counter is both incorrect and a cross-request leak.

**The `ratelimit` binding is not a brute-force control.** Being per-colocation, an attacker
distributed across colocations receives a multiple of the intended allowance. It is adequate
for protecting the request budget and inadequate for protecting a six-digit code.

Minimum coverage:

| Endpoint | Layer |
|---|---|
| sign-in request (send OTP / magic link) | DB counter, per email **and** per IP |
| sign-in verification (submit OTP / token) | DB counter — attempt cap, then lock the token |
| OAuth callback | WAF + `ratelimit` binding |
| product submission | `ratelimit` binding, per user |
| comment posting | DB counter, per user — see below |
| reports | DB counter, per user + Turnstile — see below |
| waitlist signup | `ratelimit` binding + Turnstile |
| image upload initiation | `ratelimit` binding, per user |
| search | WAF + `ratelimit` binding |
| waitlist CSV export | DB counter — bulk PII, also audit-logged |

**Comment posting and reporting use the DB counter, not the binding.** The Workers
`ratelimit` binding is what those two endpoints should eventually use, and the table above named
it first. Nothing is deployed to Workers yet, so there is no binding to call and the real choice
is the counted layer or no limit at all. Counted is the stricter of the two, the request already
writes a row, and moving a rule back to the edge layer is a one-line change to
`RATE_LIMITS` in `src/services/security/rate-limit.ts`. Shipping the weaker option would have
meant shipping none.

Every counted limit shares one table, `rate_limits`, with the rule name inside the hashed key so
two limits can never share a counter. That sharing has one hazard worth naming: a sweep of
expired rows must use a horizon no rule can outlive, never the calling rule's own window — the
naive version lets a short-window limit delete a long-window limit's live counter, which is a
rate limit bypassable through a second, unrelated endpoint. `tests/integration/rate-limit.test.ts`
pins it.

Turnstile should be applied selectively to public/high-abuse endpoints. Its token must be
**verified server-side** against the siteverify endpoint and treated as single-use; a token
validated only in the browser is not a control at all.

The rate limiter sits behind an interface in `lib/security/` so the Cloudflare-specific parts
stay replaceable, per the portability rule in [`ARCHITECTURE.md`](./ARCHITECTURE.md) §13.

## 12. Abuse budget

Because the application runs on a usage-limited serverless platform, abuse protection is also a cost-control mechanism.

Never allow an unauthenticated endpoint to trigger expensive work repeatedly.

## 13. Data deletion

Support account deletion and product removal requests.

The authoritative field-by-field policy is the retention matrix in
[`LEGAL.md`](./LEGAL.md) §5. It states, per field, what is erased, what is anonymised, what is
retained, and for how long. Any migration adding a personal-data column must add a row there in
the same pull request.

Two rules follow and are enforced in review:

- **Anonymisation must be irreversible.** Replacing a display name while keeping the foreign key
  to a live user row is not anonymisation.
- **A soft-deleted row that still holds personal data has not been deleted.** Soft delete is the
  default for *content*, so discussion context survives; it is never the answer for *personal
  data*. This resolves the apparent conflict with
  [`ARCHITECTURE.md`](./ARCHITECTURE.md) §6.

## 14. Security reporting

Provide a `SECURITY.md` with a private reporting mechanism once the repository is public.

Do not ask researchers to disclose serious vulnerabilities in public issues.
