// tests/unit/lib/security/rate-limit.test.ts
import { describe, expect, it } from "vitest";

import {
  InMemoryRateLimiter,
  rateLimitKey,
  type RateLimitRule,
} from "@/lib/security/rate-limit";

/**
 * The interface, exercised against the in-memory implementation: allow, deny,
 * window reset, and explicit reset. ADR-017 makes the *choice of layer* the
 * security-relevant decision, but the counting contract below is what every
 * layer has to honour.
 */

const RULE: RateLimitRule = {
  name: "sign-in-request",
  limit: 3,
  windowSeconds: 60,
  layer: "counted",
};

/** A clock the test controls, so no test sleeps. */
function fixedClock(start = 1_700_000_000_000) {
  let now = start;

  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe("rateLimitKey", () => {
  it("namespaces by rule, so two limits cannot share a counter", () => {
    expect(rateLimitKey(RULE, "a@example.test")).not.toBe(
      rateLimitKey({ ...RULE, name: "comment-post" }, "a@example.test")
    );
  });

  it("separates subjects", () => {
    expect(rateLimitKey(RULE, "a@example.test")).not.toBe(
      rateLimitKey(RULE, "b@example.test")
    );
  });
});

describe("InMemoryRateLimiter", () => {
  it("allows the first request in a window", async () => {
    const limiter = new InMemoryRateLimiter(fixedClock().now);

    const decision = await limiter.consume(RULE, "someone");

    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(2);
  });

  it("allows exactly the limit, then denies", async () => {
    const limiter = new InMemoryRateLimiter(fixedClock().now);

    for (let attempt = 0; attempt < RULE.limit; attempt += 1) {
      await expect(
        limiter.consume(RULE, "someone").then((d) => d.allowed)
      ).resolves.toBe(true);
    }

    const denied = await limiter.consume(RULE, "someone");

    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it("counts down remaining", async () => {
    const limiter = new InMemoryRateLimiter(fixedClock().now);

    const remaining: number[] = [];
    for (let attempt = 0; attempt < RULE.limit; attempt += 1) {
      remaining.push((await limiter.consume(RULE, "someone")).remaining);
    }

    expect(remaining).toEqual([2, 1, 0]);
  });

  it("counts each subject separately", async () => {
    const limiter = new InMemoryRateLimiter(fixedClock().now);

    for (let attempt = 0; attempt < RULE.limit; attempt += 1) {
      await limiter.consume(RULE, "noisy");
    }

    // One subject exhausting a limit must not lock everyone else out.
    await expect(
      limiter.consume(RULE, "quiet").then((d) => d.allowed)
    ).resolves.toBe(true);
  });

  it("does not carry a denial past the window", async () => {
    const clock = fixedClock();
    const limiter = new InMemoryRateLimiter(clock.now);

    for (let attempt = 0; attempt < RULE.limit; attempt += 1) {
      await limiter.consume(RULE, "someone");
    }
    await expect(
      limiter.consume(RULE, "someone").then((d) => d.allowed)
    ).resolves.toBe(false);

    clock.advance(RULE.windowSeconds * 1000);

    await expect(
      limiter.consume(RULE, "someone").then((d) => d.allowed)
    ).resolves.toBe(true);
  });

  it("still denies one millisecond before the window ends", async () => {
    const clock = fixedClock();
    const limiter = new InMemoryRateLimiter(clock.now);

    for (let attempt = 0; attempt < RULE.limit; attempt += 1) {
      await limiter.consume(RULE, "someone");
    }

    clock.advance(RULE.windowSeconds * 1000 - 1);

    await expect(
      limiter.consume(RULE, "someone").then((d) => d.allowed)
    ).resolves.toBe(false);
  });

  it("reports when the window resets", async () => {
    const clock = fixedClock();
    const limiter = new InMemoryRateLimiter(clock.now);

    const decision = await limiter.consume(RULE, "someone");

    expect(decision.resetAt).toBe(clock.now() + RULE.windowSeconds * 1000);
  });

  it("keeps the same resetAt across a window", async () => {
    const clock = fixedClock();
    const limiter = new InMemoryRateLimiter(clock.now);

    const first = await limiter.consume(RULE, "someone");
    clock.advance(1000);
    const second = await limiter.consume(RULE, "someone");

    // A sliding reset would let a persistent caller extend its own window.
    expect(second.resetAt).toBe(first.resetAt);
  });

  it("clears a subject on reset", async () => {
    const limiter = new InMemoryRateLimiter(fixedClock().now);

    for (let attempt = 0; attempt < RULE.limit; attempt += 1) {
      await limiter.consume(RULE, "someone");
    }

    await limiter.reset(RULE, "someone");

    await expect(
      limiter.consume(RULE, "someone").then((d) => d.allowed)
    ).resolves.toBe(true);
  });

  it("resetting one subject leaves another counted", async () => {
    const limiter = new InMemoryRateLimiter(fixedClock().now);

    for (let attempt = 0; attempt < RULE.limit; attempt += 1) {
      await limiter.consume(RULE, "one");
      await limiter.consume(RULE, "two");
    }

    await limiter.reset(RULE, "one");

    await expect(
      limiter.consume(RULE, "two").then((d) => d.allowed)
    ).resolves.toBe(false);
  });
});
