// tests/unit/services/security/turnstile.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyTurnstile } from "@/services/security/turnstile";

/**
 * The decision layer: when the challenge runs, and what a failure means.
 *
 * The adapter itself — the siteverify call, its error codes, its hostname and
 * action checks — is covered in `tests/unit/lib/security/turnstile.test.ts`.
 * What is asserted here is the half a submission depends on: **a failed
 * verification rejects**, which is the Phase 3 slice 3.5 requirement, and a
 * missing token is a failure rather than a skip.
 */

const env = process.env as Record<string, string | undefined>;
const ENV_KEYS = [
  "TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NODE_ENV",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, env[key]]));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete env[key];
    else env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

function enableTurnstile() {
  env.TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
  env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
  env.NODE_ENV = "development";
}

function siteverifyReturns(body: Record<string, unknown>) {
  // Typed as the adapter calls it, so the assertion on the posted FormData
  // below has something to read rather than `never`.
  const fetchMock = vi.fn(
    async (url: string, init?: { body?: unknown }) => {
      void url;
      void init;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("verifyTurnstile when the control is configured", () => {
  it("rejects a token Cloudflare refuses", async () => {
    // The requirement: a failed verification rejects the submission. Without
    // this the widget is decoration and the form is open to anything that can
    // post.
    siteverifyReturns({ success: false, "error-codes": ["invalid-input-response"] });
    enableTurnstile();

    await expect(verifyTurnstile("a-token", "comment")).resolves.toEqual({
      ok: false,
      reason: "invalid-input-response",
    });
  });

  it("rejects a submission with no token at all", async () => {
    // The shape an attacker actually sends: the form fields without the widget.
    const fetchMock = siteverifyReturns({ success: true, action: "comment" });
    enableTurnstile();

    await expect(verifyTurnstile(undefined, "comment")).resolves.toEqual({
      ok: false,
      reason: "missing-input-response",
    });
    // And it costs no network call, so a flood of tokenless posts cannot be
    // turned into a flood of siteverify requests.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty token", async () => {
    siteverifyReturns({ success: true, action: "comment" });
    enableTurnstile();

    await expect(verifyTurnstile("", "comment")).resolves.toMatchObject({
      ok: false,
    });
  });

  it("accepts a token Cloudflare confirms for the right action", async () => {
    siteverifyReturns({ success: true, action: "comment" });
    enableTurnstile();

    await expect(verifyTurnstile("a-token", "comment")).resolves.toEqual({
      ok: true,
      hostname: undefined,
    });
  });

  it("rejects a token minted for a different form", async () => {
    // The comment widget and the report widget declare different actions, so a
    // token harvested from one cannot be replayed against the other.
    siteverifyReturns({ success: true, action: "comment" });
    enableTurnstile();

    await expect(verifyTurnstile("a-token", "report")).resolves.toEqual({
      ok: false,
      reason: "action-mismatch",
    });
  });

  it("rejects when siteverify cannot be reached", async () => {
    // Fails closed. A verification service that is down is not a reason to
    // start accepting unverified submissions.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      })
    );
    enableTurnstile();

    await expect(verifyTurnstile("a-token", "comment")).resolves.toEqual({
      ok: false,
      reason: "verification-unavailable",
    });
  });

  it("passes the visitor address through without storing it", async () => {
    const fetchMock = siteverifyReturns({ success: true, action: "comment" });
    enableTurnstile();

    await verifyTurnstile("a-token", "comment", "203.0.113.9");

    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("remoteip")).toBe("203.0.113.9");
  });
});

describe("verifyTurnstile when the control is not configured", () => {
  it("passes, so a clean checkout and CI still work", async () => {
    const fetchMock = siteverifyReturns({ success: false });
    env.TURNSTILE_SITE_KEY = "";
    env.TURNSTILE_SECRET_KEY = "";
    env.NODE_ENV = "development";

    await expect(verifyTurnstile(undefined, "comment")).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws in a deployment rather than passing", async () => {
    // The case that matters. A deployed site with no keys must not quietly
    // serve a form with no bot protection.
    env.TURNSTILE_SITE_KEY = "";
    env.TURNSTILE_SECRET_KEY = "";
    env.NODE_ENV = "production";
    env.NEXT_PUBLIC_SITE_URL = "https://failproducts.com";

    await expect(verifyTurnstile("a-token", "comment")).rejects.toThrow(
      /required in a deployment/
    );
  });
});
