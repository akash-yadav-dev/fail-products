// tests/unit/lib/security/turnstile.test.ts
import { describe, expect, it, vi } from "vitest";

import {
  TURNSTILE_SITEVERIFY_URL,
  verifyTurnstileToken,
} from "@/integrations/cloudflare/turnstile";

/**
 * docs/SECURITY.md §11: the token is verified server-side against siteverify,
 * and treated as single-use. The behaviour that matters is what happens when
 * verification does *not* succeed — a token that cannot be verified must never
 * read as verified.
 */

function respondWith(
  body: unknown,
  init: { status?: number } = {}
): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "Content-Type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

const SECRET = "test-secret-not-a-real-key";

describe("verifyTurnstileToken", () => {
  it("accepts a token Cloudflare confirms", async () => {
    const result = await verifyTurnstileToken("token", {
      secret: SECRET,
      fetchImpl: respondWith({ success: true, hostname: "failproducts.test" }),
    });

    expect(result).toEqual({ ok: true, hostname: "failproducts.test" });
  });

  it("rejects a successful token for the wrong hostname", async () => {
    const result = await verifyTurnstileToken("token", {
      secret: SECRET,
      expectedHostname: "failproducts.com",
      fetchImpl: respondWith({ success: true, hostname: "attacker.example" }),
    });
    expect(result).toEqual({ ok: false, reason: "hostname-mismatch" });
  });

  it("rejects a successful token for the wrong action", async () => {
    const result = await verifyTurnstileToken("token", {
      secret: SECRET,
      expectedAction: "signup",
      fetchImpl: respondWith({ success: true, hostname: "failproducts.com", action: "login" }),
    });
    expect(result).toEqual({ ok: false, reason: "action-mismatch" });
  });

  it("posts to the documented siteverify endpoint", async () => {
    const fetchImpl = respondWith({ success: true });

    await verifyTurnstileToken("token", { secret: SECRET, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      TURNSTILE_SITEVERIFY_URL,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends the secret and the token", async () => {
    const fetchImpl = respondWith({ success: true });

    await verifyTurnstileToken("a-token", { secret: SECRET, fetchImpl });

    const body = (
      vi.mocked(fetchImpl).mock.calls[0]![1] as { body: FormData }
    ).body;

    expect(body.get("secret")).toBe(SECRET);
    expect(body.get("response")).toBe("a-token");
  });

  it("includes the visitor IP when given one", async () => {
    const fetchImpl = respondWith({ success: true });

    await verifyTurnstileToken("a-token", {
      secret: SECRET,
      remoteIp: "203.0.113.7",
      fetchImpl,
    });

    const body = (
      vi.mocked(fetchImpl).mock.calls[0]![1] as { body: FormData }
    ).body;

    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it("omits the IP when there is none", async () => {
    const fetchImpl = respondWith({ success: true });

    await verifyTurnstileToken("a-token", { secret: SECRET, fetchImpl });

    const body = (
      vi.mocked(fetchImpl).mock.calls[0]![1] as { body: FormData }
    ).body;

    expect(body.get("remoteip")).toBeNull();
  });

  it("rejects an empty token without calling out", async () => {
    const fetchImpl = respondWith({ success: true });

    const result = await verifyTurnstileToken("", {
      secret: SECRET,
      fetchImpl,
    });

    expect(result).toEqual({ ok: false, reason: "missing-input-response" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports the error codes Cloudflare returns", async () => {
    // A replayed token comes back as timeout-or-duplicate. This is what makes
    // single-use observable to the caller.
    const result = await verifyTurnstileToken("token", {
      secret: SECRET,
      fetchImpl: respondWith({
        success: false,
        "error-codes": ["timeout-or-duplicate"],
      }),
    });

    expect(result).toEqual({ ok: false, reason: "timeout-or-duplicate" });
  });

  it("rejects when siteverify returns an HTTP error", async () => {
    const result = await verifyTurnstileToken("token", {
      secret: SECRET,
      fetchImpl: respondWith({}, { status: 500 }),
    });

    expect(result).toEqual({ ok: false, reason: "siteverify-http-500" });
  });

  it("rejects when the request cannot be made at all", async () => {
    // An unverifiable token is not a verified one. Failing open here would
    // turn every Cloudflare outage into an open door.
    const result = await verifyTurnstileToken("token", {
      secret: SECRET,
      fetchImpl: vi.fn(async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    });

    expect(result).toEqual({ ok: false, reason: "verification-unavailable" });
  });

  it("does not leak the transport error, which can carry the secret", async () => {
    const result = await verifyTurnstileToken("token", {
      secret: SECRET,
      fetchImpl: vi.fn(async () => {
        throw new Error(`request failed with secret=${SECRET}`);
      }) as unknown as typeof fetch,
    });

    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("throws when the secret is not configured", async () => {
    // A deployment fault, not a rejected visitor. It must be loud.
    await expect(
      verifyTurnstileToken("token", { secret: "" })
    ).rejects.toThrowError(/TURNSTILE_SECRET_KEY is not set/);
  });
});
