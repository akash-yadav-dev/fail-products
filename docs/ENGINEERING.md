# FailProducts — Engineering Rules

## 1. General rules

1. Prefer simple code over clever abstractions.
2. Keep business rules explicit.
3. Validate data at trust boundaries.
4. Keep third-party integrations behind adapters.
5. Avoid premature infrastructure.
6. Optimize after measuring.
7. Every public mutation must have authorization and abuse protection.
8. Every database migration must be reversible or have a documented recovery path.
9. Do not silently swallow errors.
10. Do not commit secrets.

## 2. TypeScript

- `strict: true`.
- Avoid `any`.
- Prefer discriminated unions for state machines.
- Prefer inferred types from Drizzle schemas where practical.
- Validate untrusted input with Zod at boundaries.
- Do not trust client-provided IDs, roles, ownership, counters, status, or pricing.

## 3. React / Next.js

- Server Components by default.
- Client Components only when browser state/event handlers are required.
- Do not fetch internal APIs from Server Components just to call your own backend. Call the service/repository directly.
- Use Route Handlers for external API boundaries.
- Keep mutations in Server Actions or Route Handlers, not in UI components.
- Use metadata APIs for SEO.
- Use `next/image` or the Cloudflare-compatible image approach where supported.

## 4. Cloudflare compatibility

Because vinext is currently beta, avoid unsupported/edge-fragile Node APIs in application code.

Do not assume packages are Workers-compatible.

Before adding a dependency:

1. confirm it can run in the Workers environment;
2. check bundle size;
3. check whether it relies on Node built-ins;
4. run the compatibility/build check.

## 5. Database

- One migration per logical change.
- Never edit an already-applied migration in shared environments.
- Add indexes only for real access patterns.
- Use transactions for related writes where partial completion would violate integrity.
- Avoid N+1 queries.
- Prefer bounded queries.
- Use cursor pagination for potentially large feeds.
- Avoid `SELECT *` in frequently executed queries.

## 6. API

Every mutation should follow:

```text
Parse
→ Validate
→ Authenticate
→ Authorize
→ Rate-limit / abuse-check
→ Execute domain use case
→ Persist
→ Return safe response
```

API responses should not expose database internals or secrets.

## 7. Performance

### Public pages

- Favor server rendering.
- Cache stable content.
- Avoid hydration unless necessary.
- Load images lazily where appropriate.
- Avoid large client-side charting/UI bundles on public pages.

### Dashboard

- Paginate lists.
- Debounce search inputs.
- Do not refetch unchanged data unnecessarily.

### Database

- Monitor slow queries.
- Add indexes after observing query patterns.

## 8. Security

- Passwords must never be logged.
- Verification tokens must be single-use and short-lived.
- Session cookies must be secure and HTTP-only in production.
- CSRF protection must be considered for cookie-authenticated mutations.
- Rate-limit registration, login, comments, product submissions and waitlist endpoints.
- Sanitize/escape user-generated HTML.
- Prefer Markdown/plain text over arbitrary HTML in comments.
- Validate outbound URLs and block dangerous schemes such as `javascript:`.
- Restrict image upload MIME types and sizes.
- Prevent SSRF if server-side URL fetching is ever introduced.

## 9. Email

ZeptoMail is transactional only.

Use templated messages with:

- subject;
- text fallback;
- HTML;
- product/user context;
- unsubscribe settings where legally required for non-transactional messaging.

Never block the main request on non-critical email delivery.

## 10. Testing

### Unit tests

Use for:

- status transitions;
- permissions;
- validation;
- referral attribution;
- moderation rules;
- slug generation.

### Integration tests

Use for:

- repository queries;
- database constraints;
- service behavior;
- email dispatch adapters.

### E2E

At minimum cover:

- registration;
- product creation;
- publication;
- comment;
- waitlist signup;
- referral click;
- moderation/report flow.

## 11. Error handling

Errors are classified as:

- user/input error;
- authorization error;
- expected domain conflict;
- external integration failure;
- unexpected internal failure.

Return appropriate safe messages. Never expose stack traces to users.

## 12. Environment variables

Use `.env.example` with names only.

Group variables:

```text
DATABASE_URL=
AUTH_*
GITHUB_*
ZEPTOMAIL_*
CLOUDFLARE_*
R2_*
TURNSTILE_*
```

No secret values in source control.

## 13. Dependency addition checklist

Before adding a package, ask:

- Does this solve a real MVP requirement?
- Is the problem already solved by the platform or existing stack?
- Is the package maintained?
- Is it small enough?
- Is it compatible with Cloudflare Workers?
- Does it introduce a Node-only dependency?
- Will contributors understand why it exists?

## 14. Database access pattern

Do not access Drizzle directly from random components.

Use:

```text
component/page
  ↓
service/use-case
  ↓
repository
  ↓
Drizzle
  ↓
Neon
```

Small read-only server queries may bypass a repository if that avoids meaningless abstraction, but consistency should win for core domain operations.

## 15. Open-source maintainability

Every major module should have:

- a clear name;
- a small public surface;
- a nearby test or example where practical;
- documentation only where the behavior is non-obvious.

Do not require contributors to understand Cloudflare internals to modify product logic.
