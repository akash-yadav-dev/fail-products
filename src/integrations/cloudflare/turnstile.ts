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

  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteIp) body.append("remoteip", remoteIp);

  let response: Response;
  try {
    response = await fetchImpl(SITEVERIFY_URL, { method: "POST", body });
  } catch {
    return { ok: false, reason: "verification-unavailable" };
  }
  if (!response.ok) {
    return { ok: false, reason: `siteverify-http-${response.status}` };
  }

  const result = (await response.json()) as SiteverifyResponse;
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
