// tests/unit/integrations/zeptomail/send-email.test.ts
import { describe, expect, it, vi } from "vitest";

import {
  sendTransactionalEmail,
  ZEPTOMAIL_ENDPOINT,
  type TransactionalMessage,
} from "@/integrations/zeptomail/send-email";

/**
 * A contract test for the adapter, against a fake `fetch`. It asserts the
 * request shape Zoho documents, and the failure behaviour docs/ENGINEERING.md
 * §9 depends on: a caller must be able to carry on when non-critical delivery
 * fails, which means this never throws on a provider error.
 */

const TOKEN = "test-token-not-a-real-key";
const FROM = { address: "hello@failproducts.test", name: "FailProducts" };

const MESSAGE: TransactionalMessage = {
  to: { address: "founder@example.test", name: "A Founder" },
  subject: "Your sign-in link",
  html: "<p>Sign in</p>",
  text: "Sign in",
};

function respondWith(status: number): typeof fetch {
  return vi.fn(
    async () => new Response(status === 204 ? null : "{}", { status })
  ) as unknown as typeof fetch;
}

function bodyOf(fetchImpl: typeof fetch): Record<string, unknown> {
  const init = vi.mocked(fetchImpl).mock.calls[0]![1] as { body: string };
  return JSON.parse(init.body);
}

describe("sendTransactionalEmail", () => {
  it("posts to the documented endpoint", async () => {
    const fetchImpl = respondWith(201);

    await sendTransactionalEmail(MESSAGE, { token: TOKEN, from: FROM, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      ZEPTOMAIL_ENDPOINT,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("uses Zoho's authorization scheme, not Bearer", async () => {
    const fetchImpl = respondWith(201);

    await sendTransactionalEmail(MESSAGE, { token: TOKEN, from: FROM, fetchImpl });

    const init = vi.mocked(fetchImpl).mock.calls[0]![1] as {
      headers: Record<string, string>;
    };

    expect(init.headers.Authorization).toBe(["Zoho-enczapikey", TOKEN].join(" "));
  });

  it("sends the recipient in the documented envelope shape", async () => {
    const fetchImpl = respondWith(201);

    await sendTransactionalEmail(MESSAGE, { token: TOKEN, from: FROM, fetchImpl });

    expect(bodyOf(fetchImpl).to).toEqual([
      {
        email_address: {
          address: "founder@example.test",
          name: "A Founder",
        },
      },
    ]);
  });

  it("rejects line breaks in header-like fields", async () => {
    await expect(
      sendTransactionalEmail(
        { ...MESSAGE, subject: "Sign in\r\nBcc: attacker@example.test" },
        {
          token: TOKEN,
          from: FROM,
          fetchImpl: vi.fn() as unknown as typeof fetch,
        }
      )
    ).rejects.toThrow("line breaks are not allowed");
  });

  it("always sends a text fallback alongside the HTML", async () => {
    const fetchImpl = respondWith(201);

    await sendTransactionalEmail(MESSAGE, { token: TOKEN, from: FROM, fetchImpl });

    const body = bodyOf(fetchImpl);

    expect(body.htmlbody).toBe("<p>Sign in</p>");
    expect(body.textbody).toBe("Sign in");
  });

  it("does not track opens or clicks", async () => {
    // Transactional mail. A tracking pixel in a sign-in email is a privacy cost
    // with no return.
    const fetchImpl = respondWith(201);

    await sendTransactionalEmail(MESSAGE, { token: TOKEN, from: FROM, fetchImpl });

    const body = bodyOf(fetchImpl);

    expect(body.track_opens).toBe(false);
    expect(body.track_clicks).toBe(false);
  });

  it("reports success on a 2xx", async () => {
    await expect(
      sendTransactionalEmail(MESSAGE, {
        token: TOKEN,
        from: FROM,
        fetchImpl: respondWith(201),
      })
    ).resolves.toEqual({ ok: true });
  });

  it("reports a 4xx as not retryable", async () => {
    // Our request is malformed; sending it again produces the same failure.
    await expect(
      sendTransactionalEmail(MESSAGE, {
        token: TOKEN,
        from: FROM,
        fetchImpl: respondWith(400),
      })
    ).resolves.toEqual({
      ok: false,
      reason: "zeptomail-http-400",
      retryable: false,
    });
  });

  it("reports a 429 as retryable", async () => {
    await expect(
      sendTransactionalEmail(MESSAGE, {
        token: TOKEN,
        from: FROM,
        fetchImpl: respondWith(429),
      })
    ).resolves.toMatchObject({ ok: false, retryable: true });
  });

  it("reports a 5xx as retryable", async () => {
    await expect(
      sendTransactionalEmail(MESSAGE, {
        token: TOKEN,
        from: FROM,
        fetchImpl: respondWith(503),
      })
    ).resolves.toMatchObject({ ok: false, retryable: true });
  });

  it("does not throw when the provider is unreachable", async () => {
    // The rule this adapter exists to honour: never block the main request on
    // non-critical delivery.
    await expect(
      sendTransactionalEmail(MESSAGE, {
        token: TOKEN,
        from: FROM,
        fetchImpl: vi.fn(async () => {
          throw new Error("network down");
        }) as unknown as typeof fetch,
      })
    ).resolves.toEqual({
      ok: false,
      reason: "transport-failure",
      retryable: true,
    });
  });

  it("does not leak the API key through a transport error", async () => {
    const result = await sendTransactionalEmail(MESSAGE, {
      token: TOKEN,
      from: FROM,
      fetchImpl: vi.fn(async () => {
        throw new Error(`failed sending with Authorization ${TOKEN}`);
      }) as unknown as typeof fetch,
    });

    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("throws when the token is not configured", async () => {
    await expect(
      sendTransactionalEmail(MESSAGE, { token: "", from: FROM })
    ).rejects.toThrowError(/ZEPTOMAIL_TOKEN is not set/);
  });

  it("throws when the sender address is not configured", async () => {
    await expect(
      sendTransactionalEmail(MESSAGE, {
        token: TOKEN,
        from: { address: "" },
      })
    ).rejects.toThrowError(/ZEPTOMAIL_FROM_ADDRESS is not set/);
  });
});
