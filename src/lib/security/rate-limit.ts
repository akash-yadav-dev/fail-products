// src/lib/security/rate-limit.ts
/**
 * The rate-limiting boundary (ADR-017, docs/SECURITY.md §11).
 *
 * Rate limiting here is **layered**, and the layer is chosen by what the limit
 * protects:
 *
 * | Layer                             | Use for                                  |
 * |-----------------------------------|------------------------------------------|
 * | Cloudflare WAF rules              | coarse flood protection, before we bill  |
 * | Workers `ratelimit` binding       | cost control, casual abuse               |
 * | Database / Durable Object counter | anything needing an accurate global count|
 *
 * The interface exists because two of those three are Cloudflare-specific, and
 * `ARCHITECTURE.md` §13 requires provider-specific parts to stay replaceable.
 * It is not an abstraction invented for testability — there are genuinely
 * multiple implementations, and picking the wrong one is a security bug.
 *
 * **The `ratelimit` binding is not a brute-force control.** It is documented as
 * permissive, eventually consistent, and per-colocation, so an attacker spread
 * across colocations gets a multiple of the intended allowance. Anything
 * guarding a secret — OTP verification, sign-in — uses a counted layer.
 */

/** Which layer a limit runs on. Named so a call site states its own threat model. */
export type RateLimitLayer =
  /** Permissive and per-colocation. Cost control only, never a security control. */
  | "edge"
  /** Accurate and globally consistent. Costs a write; use where correctness matters. */
  | "counted";

export type RateLimitDecision = {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** When the window resets, as epoch milliseconds. */
  resetAt: number;
};

export type RateLimitRule = {
  /** Stable name for the limit, e.g. "sign-in-request". Part of the key. */
  name: string;
  limit: number;
  windowSeconds: number;
  layer: RateLimitLayer;
};

/**
 * What a limiter must do.
 *
 * `subject` is what the limit is counted against — an account id, an email, an
 * IP. It is never the raw request: deciding what to count is the caller's
 * responsibility, and docs/SECURITY.md §11 specifies it per endpoint (sign-in
 * counts per email *and* per IP, for instance).
 */
export interface RateLimiter {
  consume(rule: RateLimitRule, subject: string): Promise<RateLimitDecision>;
  reset(rule: RateLimitRule, subject: string): Promise<void>;
}

/** Namespaced so two rules can never share a counter. */
export function rateLimitKey(rule: RateLimitRule, subject: string): string {
  return `${rule.name}:${subject}`;
}

/**
 * An in-memory limiter.
 *
 * **Tests and local development only.** On Workers this would be wrong twice
 * over: isolates are shared and recycled, so the counter is neither global nor
 * durable, and state surviving between requests in one isolate is a
 * cross-request leak. It is exported so the interface has something to be
 * tested against, and it throws if it ever reaches production.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(private readonly now: () => number = Date.now) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "InMemoryRateLimiter is not a production limiter — see ADR-017"
      );
    }
  }

  async consume(
    rule: RateLimitRule,
    subject: string
  ): Promise<RateLimitDecision> {
    const key = rateLimitKey(rule, subject);
    const now = this.now();
    const existing = this.windows.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + rule.windowSeconds * 1000;

      this.windows.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: rule.limit - 1, resetAt };
    }

    if (existing.count >= rule.limit) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }

    existing.count += 1;

    return {
      allowed: true,
      remaining: rule.limit - existing.count,
      resetAt: existing.resetAt,
    };
  }

  async reset(rule: RateLimitRule, subject: string): Promise<void> {
    this.windows.delete(rateLimitKey(rule, subject));
  }
}
