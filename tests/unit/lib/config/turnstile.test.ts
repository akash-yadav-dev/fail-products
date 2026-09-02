// tests/unit/lib/config/turnstile.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  requireTurnstileSecret,
  turnstileEnabled,
  turnstileSiteKey,
} from "@/lib/config/turnstile";

/**
 * The three-way behaviour in `src/lib/config/turnstile.ts`.
 *
 * The case worth a test is the third one: a **deployment** with no keys must
 * fail loudly rather than quietly serve a site with no bot protection. That is
 * a silent failure that goes unnoticed until the spam arrives, and nothing else
 * in the system would report it.
 */

const ENV_KEYS = [
  "TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NODE_ENV",
] as const;

/**
 * `process.env.NODE_ENV` is typed read-only, and these tests exist precisely to
 * exercise the branch that depends on it. The cast is confined to this alias so
 * it is one deliberate escape rather than a scatter of them.
 */
const env = process.env as Record<string, string | undefined>;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, env[key]]));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete env[key];
    else env[key] = saved[key];
  }
});

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) delete env[key];
  for (const [key, value] of Object.entries(values)) {
    env[key] = value;
  }
}

describe("turnstileEnabled", () => {
  it("is on when both keys are configured", () => {
    setEnv({
      TURNSTILE_SITE_KEY: "site",
      TURNSTILE_SECRET_KEY: "secret",
    });

    expect(turnstileEnabled()).toBe(true);
  });

  it("is off in a development checkout with no keys", () => {
    // A clean clone, the test suite, and CI all have to work without a
    // Cloudflare account.
    setEnv({ NODE_ENV: "development" });

    expect(turnstileEnabled()).toBe(false);
  });

  it("is off against a local production build", () => {
    // `next start` is production mode without being a deployment. Treating the
    // two alike would make the E2E suite require a Cloudflare account.
    setEnv({
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
    });

    expect(turnstileEnabled()).toBe(false);
  });

  it("throws in a deployment with no keys", () => {
    setEnv({
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://failproducts.com",
    });

    expect(() => turnstileEnabled()).toThrow(/required in a deployment/);
  });

  it("throws in a deployment configured with only half the pair", () => {
    // The likelier mistake than forgetting both: a site key committed to an
    // environment file and a secret that was never added.
    setEnv({
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://failproducts.com",
      TURNSTILE_SITE_KEY: "site",
    });

    expect(() => turnstileEnabled()).toThrow(/required in a deployment/);
  });

  it("treats an empty string as unset", () => {
    // `.env.example` carries names with no values, and an empty variable is
    // what a half-filled environment file actually produces.
    setEnv({
      NODE_ENV: "development",
      TURNSTILE_SITE_KEY: "",
      TURNSTILE_SECRET_KEY: "",
    });

    expect(turnstileSiteKey()).toBeNull();
    expect(turnstileEnabled()).toBe(false);
  });
});

describe("requireTurnstileSecret", () => {
  it("returns the secret when there is one", () => {
    setEnv({ TURNSTILE_SECRET_KEY: "secret" });

    expect(requireTurnstileSecret()).toBe("secret");
  });

  it("throws rather than returning an empty secret", () => {
    // The adapter would refuse an empty secret anyway; failing here says which
    // variable is missing instead of reporting a verification failure.
    setEnv({});

    expect(() => requireTurnstileSecret()).toThrow(/TURNSTILE_SECRET_KEY/);
  });
});
