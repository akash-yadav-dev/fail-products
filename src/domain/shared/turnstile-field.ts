// src/domain/shared/turnstile-field.ts
/**
 * The name of the form field carrying a Turnstile token.
 *
 * It lives in `domain/` because both halves of the control need it and they
 * may not import each other: the widget is a client component and the verifier
 * reads the secret and calls Cloudflare, so a shared constant in the service
 * would pull server-only code into the browser bundle. A bare string is the
 * whole of the shared knowledge, so this is where it belongs
 * (`CLAUDE.md` §6 — `domain/` imports nothing).
 *
 * The value is Cloudflare's, not ours: it is the field name Turnstile's own
 * script uses, and changing it would silently stop the server finding a token
 * the browser did produce.
 */
export const TURNSTILE_FIELD = "cf-turnstile-response";
