// src/services/auth/rate-limit.ts
import { sha256Base64Url } from "@/lib/auth/crypto";
import type { AuthRepository } from "@/repositories/auth-repository";
import type { RateLimitScope } from "@/repositories/rate-limit-repository";

/**
 * Auth's counted limits (ADR-017).
 *
 * The counter itself moved to `rate_limits`, the application-wide table, in
 * Phase 3 — `services/security/rate-limit.ts` is the general limiter. This
 * stays because the auth service's call sites take an `AuthRepository` and
 * nothing else, and rewriting a signed-in path's dependencies to share a table
 * would be churn on the most security-sensitive code in the project for no
 * behavioural gain. The key derivation is identical either way.
 */

export type DatabaseLimit = {
  name: string;
  scope: RateLimitScope;
  limit: number;
  windowSeconds: number;
};

export async function consumeDatabaseLimit(
  repository: AuthRepository,
  rule: DatabaseLimit,
  subject: string,
  now = Date.now()
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const keyHash = await sha256Base64Url(`${rule.name}:${rule.scope}:${subject}`);
  return repository.consumeRateLimit({ ...rule, keyHash, now });
}
