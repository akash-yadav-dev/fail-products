// src/services/security/rate-limit.ts
import { sha256Base64Url } from "@/lib/auth/crypto";
import type {
  RateLimitDecision,
  RateLimitRule,
  RateLimiter,
} from "@/lib/security/rate-limit";
import { rateLimitKey } from "@/lib/security/rate-limit";
import type {
  RateLimitRepository,
  RateLimitScope,
} from "@/repositories/rate-limit-repository";

/**
 * The counted implementation of the `lib/security` limiter interface (ADR-017).
 *
 * `lib/security/rate-limit.ts` describes *what a limiter does*, without naming
 * where the count lives, because two of the three layers ADR-017 defines are
 * Cloudflare-specific. This is the layer that keeps the count in Postgres:
 * accurate, globally consistent, and one write per request.
 *
 * A rule reaching this class carries a `scope` the portable interface does not
 * have, because the scope is a storage detail — a column that makes a counter
 * row readable during an incident. It is added here rather than pushed up into
 * `lib/security`, so a future Durable Object limiter is not obliged to carry a
 * field that means nothing to it.
 */

/** A rule that can be counted: the portable rule plus where the count is filed. */
export type CountedRule = RateLimitRule & {
  layer: "counted";
  scope: RateLimitScope;
};

export class DatabaseRateLimiter implements RateLimiter {
  /**
   * The clock is injectable for the same reason `InMemoryRateLimiter`'s is: a
   * window reset is a property worth testing, and the alternative is a test
   * that sleeps for the length of the window.
   */
  constructor(
    private readonly repository: RateLimitRepository,
    private readonly now: () => number = Date.now
  ) {}

  async consume(
    rule: RateLimitRule,
    subject: string
  ): Promise<RateLimitDecision> {
    const counted = asCountedRule(rule);

    return this.repository.consume({
      scope: counted.scope,
      keyHash: await keyHashFor(counted, subject),
      limit: counted.limit,
      windowSeconds: counted.windowSeconds,
      now: this.now(),
    });
  }

  async reset(rule: RateLimitRule, subject: string): Promise<void> {
    const counted = asCountedRule(rule);
    await this.repository.reset(
      counted.scope,
      await keyHashFor(counted, subject)
    );
  }
}

/**
 * The stored key.
 *
 * Hashed, so the table holds no email address and no account id — a counter row
 * needs to be comparable, never readable (docs/LEGAL.md §5). `rateLimitKey`
 * namespaces by rule first, which is what stops two limits sharing a counter.
 */
function keyHashFor(rule: CountedRule, subject: string): Promise<string> {
  return sha256Base64Url(`${rule.scope}:${rateLimitKey(rule, subject)}`);
}

/**
 * Refuses a rule that names a layer this class does not implement.
 *
 * Passing an `edge` rule here would silently upgrade it to a database write on
 * every request — cheap to miss in review, and expensive in exactly the place
 * ADR-017 says to be careful. The reverse mistake matters more, so the check
 * runs rather than the type being trusted: rules arrive from module constants,
 * and a constant edited to `"edge"` is not a type error at this call site.
 */
function asCountedRule(rule: RateLimitRule): CountedRule {
  if (rule.layer !== "counted") {
    throw new Error(
      `DatabaseRateLimiter received a ${rule.layer} rule: ${rule.name}`
    );
  }
  return rule as CountedRule;
}

/**
 * Every counted limit the application enforces, in one place.
 *
 * `docs/SECURITY.md` §11 names the layer per endpoint; this is where the
 * numbers live, so a limit cannot be tuned in one call site and forgotten in
 * another. Windows stay well inside `MAX_RATE_LIMIT_WINDOW_SECONDS`.
 */
export const RATE_LIMITS = {
  /**
   * Comment posting, per account.
   *
   * `SECURITY.md` §11 names the Workers `ratelimit` binding for this endpoint.
   * The binding is not available: nothing is deployed to Workers yet and there
   * is no binding to call, so the choice is this layer or no limit at all.
   * Counted is the stricter of the two and the request already writes a row,
   * so the extra write is not a new class of cost. When the binding exists,
   * moving this rule to `layer: "edge"` is the whole change.
   *
   * Ten in ten minutes is a person arguing, not a person flooding. It is
   * deliberately generous: the failure this guards is a script, and a limit
   * tight enough to catch a heated thread would be moderation by throttle.
   */
  commentPost: {
    name: "comment-post",
    scope: "USER",
    limit: 10,
    windowSeconds: 10 * 60,
    layer: "counted",
  },

  /**
   * Reporting, per account.
   *
   * Reporting is itself an abuse vector — a coordinated group filing reports is
   * how a moderation queue gets used as a weapon — so the limit is tighter than
   * commenting and the window is longer. Duplicate reports on one target
   * collapse before they reach here, so this counts distinct complaints.
   */
  reportSubmit: {
    name: "report-submit",
    scope: "USER",
    limit: 20,
    windowSeconds: 60 * 60,
    layer: "counted",
  },
} as const satisfies Record<string, CountedRule>;
