// tests/unit/services/security/rate-limit-rules.test.ts
import { describe, expect, it } from "vitest";

import { MAX_RATE_LIMIT_WINDOW_SECONDS } from "@/repositories/rate-limit-repository";
import { RATE_LIMITS } from "@/services/security/rate-limit";

/**
 * The declared rules, checked against the sweep that has to outlive them.
 *
 * One `rate_limits` table serves every counted limit, so the sweep cannot use
 * the calling rule's window — a fifteen-minute rule would delete an hour-long
 * rule's live counter, and the hour-long limit becomes bypassable by touching
 * the unrelated endpoint. The sweep therefore deletes on a fixed horizon
 * (`MAX_RATE_LIMIT_WINDOW_SECONDS`) that no rule may exceed.
 *
 * `RateLimitRepository.consume` enforces that, but only for a rule it is
 * actually handed. A rule configured with a window past the horizon compiles,
 * lints, and passes every other test; it fails the first time someone hits that
 * endpoint in production, and until then the sweep is quietly deleting counters
 * the rule still needs. This closes the gap between "the guard exists" and "the
 * configuration obeys it".
 */

describe("the declared rate limit rules", () => {
  const rules = Object.entries(RATE_LIMITS);

  it("declares at least one rule", () => {
    // Guards against the suite passing vacuously if RATE_LIMITS is emptied or
    // renamed — every assertion below iterates it.
    expect(rules.length).toBeGreaterThan(0);
  });

  it("keeps every window inside the sweep horizon", () => {
    for (const [key, rule] of rules) {
      expect(
        rule.windowSeconds,
        `RATE_LIMITS.${key} ("${rule.name}") has a ${rule.windowSeconds}s window, ` +
          `past the ${MAX_RATE_LIMIT_WINDOW_SECONDS}s sweep horizon. The shared ` +
          "sweep would delete its live counters, making the limit bypassable. " +
          "Shorten the window, or raise MAX_RATE_LIMIT_WINDOW_SECONDS and accept " +
          "that rate_limits rows are then retained for longer."
      ).toBeLessThanOrEqual(MAX_RATE_LIMIT_WINDOW_SECONDS);
    }
  });

  it("gives every rule a positive window and limit", () => {
    // A zero or negative window makes resetAt land in the past, so the counter
    // resets on every request and the limit does not exist. A zero limit locks
    // the endpoint out entirely. Neither fails loudly on its own.
    for (const [key, rule] of rules) {
      expect(rule.windowSeconds, key).toBeGreaterThan(0);
      expect(rule.limit, key).toBeGreaterThan(0);
    }
  });

  it("gives every rule a distinct name", () => {
    // The name is half the counter key. Two rules sharing one would share a
    // counter, so the tighter limit would silently govern both endpoints.
    const names = rules.map(([, rule]) => rule.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
