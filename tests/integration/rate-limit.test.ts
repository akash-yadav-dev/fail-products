// tests/integration/rate-limit.test.ts
import { describe, expect, it } from "vitest";

import { RateLimitRepository } from "@/repositories/rate-limit-repository";
import {
  DatabaseRateLimiter,
  type CountedRule,
} from "@/services/security/rate-limit";
import { noDatabase, testDb, unique } from "./database";

/**
 * The counted rate-limit layer (ADR-017, Phase 3 slice 3.1).
 *
 * The unit suite covers the counting contract against the in-memory
 * implementation. What can only be shown here is the part that made this layer
 * worth the write in the first place: that the count stays correct when
 * requests arrive at once, and that two limits sharing one table cannot
 * interfere with each other.
 */

const db = noDatabase ? null : testDb();

function rule(overrides: Partial<CountedRule> = {}): CountedRule {
  return {
    name: unique("test-limit"),
    scope: "USER",
    limit: 5,
    windowSeconds: 15 * 60,
    layer: "counted",
    ...overrides,
  };
}

/** A clock the test controls, so no test sleeps through a window. */
function clock(start = Date.now()) {
  let now = start;
  return {
    read: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe.skipIf(noDatabase)("counted rate limiter", () => {
  it("allows exactly the limit, then denies", async () => {
    const limiter = new DatabaseRateLimiter(new RateLimitRepository(db!));
    const subject = unique("user");
    const limit = rule({ limit: 3 });

    const decisions = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      decisions.push(await limiter.consume(limit, subject));
    }
    await track(limiter, limit, subject);

    expect(decisions.map((decision) => decision.allowed)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(decisions[2]!.remaining).toBe(0);
  });

  it("stays accurate when the requests arrive at once", async () => {
    // The reason this layer costs a write. A read-then-write limiter lets two
    // simultaneous requests both observe `count = limit - 1` and both pass;
    // the single upsert cannot, because the increment happens in the database.
    const limiter = new DatabaseRateLimiter(new RateLimitRepository(db!));
    const subject = unique("user");
    const limit = rule({ limit: 4 });

    const decisions = await Promise.all(
      Array.from({ length: 12 }, () => limiter.consume(limit, subject))
    );
    await track(limiter, limit, subject);

    const allowed = decisions.filter((decision) => decision.allowed).length;
    expect(allowed).toBe(4);
  });

  it("starts a fresh window once the old one has passed", async () => {
    const time = clock();
    const limiter = new DatabaseRateLimiter(
      new RateLimitRepository(db!),
      time.read
    );
    const subject = unique("user");
    const limit = rule({ limit: 2, windowSeconds: 60 });

    await limiter.consume(limit, subject);
    await limiter.consume(limit, subject);
    expect((await limiter.consume(limit, subject)).allowed).toBe(false);

    time.advance(61_000);
    expect((await limiter.consume(limit, subject)).allowed).toBe(true);
    await track(limiter, limit, subject);
  });

  it("does not let a short-window rule reset a long-window rule's counter", async () => {
    // The defect a shared counter table invites. The sweep used to delete every
    // row older than the *calling* rule's window, so a fifteen-minute limit
    // would clear an hour-long limit's counter — a rate limit bypassable by
    // using a second, unrelated endpoint.
    const time = clock();
    const repository = new RateLimitRepository(db!);
    const limiter = new DatabaseRateLimiter(repository, time.read);
    const subject = unique("user");
    const hourly = rule({ limit: 2, windowSeconds: 60 * 60 });
    const short = rule({ limit: 50, windowSeconds: 15 * 60 });

    await limiter.consume(hourly, subject);
    await limiter.consume(hourly, subject);

    time.advance(20 * 60 * 1000);
    await limiter.consume(short, subject);

    // Twenty minutes in, the hourly window is still open and already spent.
    expect((await limiter.consume(hourly, subject)).allowed).toBe(false);
    await track(limiter, hourly, subject);
    await track(limiter, short, subject);
  });

  it("counts two subjects separately", async () => {
    const limiter = new DatabaseRateLimiter(new RateLimitRepository(db!));
    const limit = rule({ limit: 1 });
    const first = unique("user");
    const second = unique("user");

    expect((await limiter.consume(limit, first)).allowed).toBe(true);
    expect((await limiter.consume(limit, second)).allowed).toBe(true);
    expect((await limiter.consume(limit, first)).allowed).toBe(false);

    await track(limiter, limit, first);
    await track(limiter, limit, second);
  });

  it("refuses a rule that names a layer it does not implement", async () => {
    const limiter = new DatabaseRateLimiter(new RateLimitRepository(db!));

    await expect(
      limiter.consume(
        { ...rule(), layer: "edge" } as unknown as CountedRule,
        unique("user")
      )
    ).rejects.toThrow(/edge rule/);
  });

  it("refuses a window longer than the sweep horizon", async () => {
    // The sweep deletes anything older than 24 hours. A rule with a longer
    // window would have its own live counter swept, and would silently stop
    // limiting rather than fail.
    const limiter = new DatabaseRateLimiter(new RateLimitRepository(db!));

    await expect(
      limiter.consume(rule({ windowSeconds: 25 * 60 * 60 }), unique("user"))
    ).rejects.toThrow(/sweep horizon/);
  });
});

/**
 * Clears the counter a test created.
 *
 * The limiter hashes the key internally, so the test asks it to clear the row
 * rather than recomputing the hash and keeping a second copy of that
 * derivation to drift out of step.
 */
async function track(
  limiter: DatabaseRateLimiter,
  limit: CountedRule,
  subject: string
) {
  await limiter.reset(limit, subject);
}
