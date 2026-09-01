import { NextResponse } from "next/server";

import { authConfig } from "@/lib/config/auth";
import { generateSessionToken, sha256Base64Url } from "@/lib/auth/crypto";
import { githubAuthorizeUrl } from "@/integrations/github/oauth";

const STATE_COOKIE = "failproducts_oauth_state";
const VERIFIER_COOKIE = "failproducts_oauth_verifier";

export async function GET() {
  const config = authConfig();
  if (!config.siteUrl || !config.githubClientId) {
    return NextResponse.json({ error: "GitHub sign-in is not configured." }, { status: 503 });
  }

  const state = generateSessionToken();
  const verifier = generateSessionToken();
  const challenge = await sha256Base64Url(verifier);
  const redirectUri = new URL("/api/auth/github/callback", config.siteUrl).toString();
  const authorize = githubAuthorizeUrl({ clientId: config.githubClientId, redirectUri, state, challenge });

  const response = NextResponse.redirect(authorize);
  const options = {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
  response.cookies.set(STATE_COOKIE, state, options);
  response.cookies.set(VERIFIER_COOKIE, verifier, options);
  return response;
}

export { STATE_COOKIE, VERIFIER_COOKIE };
