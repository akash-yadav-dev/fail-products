import { NextResponse } from "next/server";

import { constantTimeEqual } from "@/lib/auth/crypto";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth/session-cookie";
import { authConfig, oauthCookieOptions } from "@/lib/config/auth";
import { signInWithGithub } from "@/services/auth/server-auth";
import { consumeOauthCallbackLimit } from "@/services/auth/server-auth";
import { exchangeGithubCode, fetchGithubProfile } from "@/integrations/github/oauth";
const STATE_COOKIE = "failproducts_oauth_state";
const VERIFIER_COOKIE = "failproducts_oauth_verifier";

function failureResponse() {
  const config = authConfig();
  if (!config.siteUrl) return NextResponse.json({ error: "OAuth is not configured." }, { status: 503 });
  return NextResponse.redirect(new URL("/auth/sign-in?error=oauth", config.siteUrl));
}

function cookieValue(request: Request, name: string) {
  return request.headers.get("cookie")?.match(new RegExp(`${name}=([^;]+)`))?.[1];
}

export async function GET(request: Request) {
  const config = authConfig();
  if (!config.siteUrl || !config.githubClientId || !config.githubClientSecret) return failureResponse();
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await consumeOauthCallbackLimit(ip)).allowed) return failureResponse();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateCookie = cookieValue(request, STATE_COOKIE);
  const verifierCookie = cookieValue(request, VERIFIER_COOKIE);
  if (!code || !state || !stateCookie || !verifierCookie || !constantTimeEqual(state, stateCookie)) return failureResponse();
  try {
    const redirectUri = new URL("/api/auth/github/callback", config.siteUrl).toString();
    const accessToken = await exchangeGithubCode({ clientId: config.githubClientId, clientSecret: config.githubClientSecret, code, redirectUri, verifier: verifierCookie });
    if (!accessToken) return failureResponse();
    const profile = await fetchGithubProfile(accessToken);
    if (!profile) return failureResponse();
    const result = await signInWithGithub({ profile });
    if (!result) return failureResponse();
    const response = NextResponse.redirect(new URL("/dashboard", config.siteUrl));
    response.cookies.set(SESSION_COOKIE, result.sessionToken, SESSION_COOKIE_OPTIONS);
    response.cookies.set(STATE_COOKIE, "", { ...oauthCookieOptions(), maxAge: 0 });
    response.cookies.set(VERIFIER_COOKIE, "", { ...oauthCookieOptions(), maxAge: 0 });
    return response;
  } catch {
    return failureResponse();
  }
}
