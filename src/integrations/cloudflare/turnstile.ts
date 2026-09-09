// src/integrations/cloudflare/turnstile.ts
/** Cloudflare Turnstile siteverify adapter (docs/SECURITY.md §11). */
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type SiteverifyResponse = {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
  action?: string;
};

export type TurnstileResult =
  | { ok: true; hostname?: string }
  | { ok: false; reason: string };

export type TurnstileOptions = {
  secret: string;
  remoteIp?: string;
  expectedHostname?: string;
  expectedAction?: string;
  fetchImpl?: typeof fetch;
};

export async function verifyTurnstileToken(
  token: string,
  {
    secret,
    remoteIp,
    expectedHostname,
    expectedAction,
    fetchImpl = fetch,
  }: TurnstileOptions
): Promise<TurnstileResult> {
  if (!secret) {
    throw new Error("TURNSTILE_SECRET_KEY is not set. See .env.example.");
  }
  if (!token) return { ok: false, reason: "missing-input-response" };
  if (token.length > 2048) return { ok: false, reason: "invalid-input-response" };

  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteIp) body.append("remoteip", remoteIp);

  // The timeout is the point: siteverify sits in front of every write this
  // form guards, so a Cloudflare stall must fail the check rather than hold a
  // request open. Parsing happens inside the same `try` because a truncated or
  // non-JSON body is the same kind of failure as never reaching the endpoint,
  // and a rejected `json()` outside it would escape as a 500.
  let result: SiteverifyResponse;
  try {
    const response = await fetchImpl(SITEVERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return { ok: false, reason: `siteverify-http-${response.status}` };
    result = (await response.json()) as SiteverifyResponse;
    if (!result || typeof result.success !== "boolean") return { ok: false, reason: "verification-unavailable" };
  } catch {
    return { ok: false, reason: "verification-unavailable" };
  }

  if (result.success) {
    if (expectedHostname && result.hostname !== expectedHostname) {
      return { ok: false, reason: "hostname-mismatch" };
    }
    if (expectedAction && result.action !== expectedAction) {
      return { ok: false, reason: "action-mismatch" };
    }
    return { ok: true, hostname: result.hostname };
  }
  return {
    ok: false,
    reason: result["error-codes"]?.join(",") ?? "verification-failed",
  };
}

export { SITEVERIFY_URL as TURNSTILE_SITEVERIFY_URL };
