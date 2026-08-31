export function authConfig() {
  return {
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    githubClientId: process.env.GITHUB_CLIENT_ID ?? "",
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    isProduction: process.env.NODE_ENV === "production",
  };
}

export function sessionCookieConfig() {
  const { isProduction } = authConfig();
  return {
    name: isProduction ? "__Host-failproducts_session" : "failproducts_session",
    options: { httpOnly: true, secure: isProduction, sameSite: "lax" as const, path: "/", maxAge: 30 * 24 * 60 * 60 },
  };
}

export function oauthCookieOptions() {
  return { httpOnly: true, secure: authConfig().isProduction, sameSite: "lax" as const, path: "/", maxAge: 600 };
}

/** Test-only fixture switch; it is never set in deployment environments. */
export function e2eAuthBypassEnabled(): boolean {
  return process.env.E2E_AUTH_BYPASS === "1" && (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("http://localhost:");
}
