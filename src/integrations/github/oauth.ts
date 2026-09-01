export type GithubProfile = { id: string; email: string | null; displayName: string | null };
type GithubTokenResponse = { access_token?: string };
type GithubUserResponse = { id: number; email?: string | null; name?: string | null; login?: string };
type GithubEmailResponse = { email: string; primary?: boolean; verified?: boolean }[];

export function githubAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string; challenge: string }) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export async function exchangeGithubCode(input: { clientId: string; clientSecret: string; code: string; redirectUri: string; verifier: string; fetchImpl?: typeof fetch }): Promise<string | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: input.clientId, client_secret: input.clientSecret, code: input.code, redirect_uri: input.redirectUri, code_verifier: input.verifier }),
  });
  const body = (await response.json()) as GithubTokenResponse;
  return response.ok ? body.access_token ?? null : null;
}

export async function fetchGithubProfile(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<GithubProfile | null> {
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${accessToken}` };
  const userResponse = await fetchImpl("https://api.github.com/user", { headers });
  if (!userResponse.ok) return null;
  const user = (await userResponse.json()) as GithubUserResponse;
  const emailsResponse = await fetchImpl("https://api.github.com/user/emails", { headers });
  if (!emailsResponse.ok) return { id: String(user.id), email: null, displayName: user.name ?? user.login ?? null };
  const emails = (await emailsResponse.json()) as GithubEmailResponse;
  const email = emails.find((entry) => entry.primary && entry.verified)?.email ?? emails.find((entry) => entry.verified)?.email ?? null;
  return { id: String(user.id), email, displayName: user.name ?? user.login ?? null };
}
