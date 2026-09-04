import type { AuthRepository } from "@/repositories/auth-repository";
import { constantTimeEqual, generateOtp, generateSessionToken, sha256Base64Url } from "@/lib/auth/crypto";
import { isValidEmail, normalizeEmail } from "@/lib/validation/email";
import { consumeDatabaseLimit } from "@/services/auth/rate-limit";

export const OTP_TTL_SECONDS = 10 * 60;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const MAX_TOKEN_ATTEMPTS = 5;
const REQUEST_LIMIT = { name: "request-email", scope: "EMAIL" as const, limit: 5, windowSeconds: 15 * 60 };
const IP_REQUEST_LIMIT = { name: "request-ip", scope: "IP" as const, limit: 10, windowSeconds: 15 * 60 };
const VERIFY_EMAIL_LIMIT = { name: "verify-email", scope: "EMAIL" as const, limit: 10, windowSeconds: 15 * 60 };
const VERIFY_IP_LIMIT = { name: "verify-ip", scope: "IP" as const, limit: 10, windowSeconds: 15 * 60 };

export type SendOtp = (input: { email: string; code: string }) => Promise<void>;
export type AuthResult =
  | { ok: true; sessionToken: string; userId: string }
  | { ok: false; reason: "invalid-code" | "rate-limited" };

async function createSession(repository: AuthRepository, userId: string, now: number) {
  const sessionToken = generateSessionToken();
  await repository.createSession({ userId, tokenHash: await sha256Base64Url(sessionToken), expiresAt: new Date(now + SESSION_TTL_SECONDS * 1000), lastSeenAt: new Date(now) });
  return sessionToken;
}

export async function requestEmailCode(input: { repository: AuthRepository; email: string; ipAddress: string; sendOtp: SendOtp; now?: number; generateCode?: () => string }): Promise<{ ok: boolean; reason?: "invalid-email" | "rate-limited" }> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) return { ok: false, reason: "invalid-email" };
  const now = input.now ?? Date.now();
  await input.repository.cleanupAuthData(now);
  const [emailLimit, ipLimit] = await Promise.all([consumeDatabaseLimit(input.repository, REQUEST_LIMIT, email, now), consumeDatabaseLimit(input.repository, IP_REQUEST_LIMIT, input.ipAddress, now)]);
  if (!emailLimit.allowed || !ipLimit.allowed) return { ok: false, reason: "rate-limited" };
  const code = input.generateCode?.() ?? generateOtp();
  await input.repository.insertToken({ email, tokenHash: await sha256Base64Url(code), expiresAt: new Date(now + OTP_TTL_SECONDS * 1000) });
  try { await input.sendOtp({ email, code }); } catch { /* Keep account existence opaque when delivery fails. */ }
  return { ok: true };
}

export async function verifyEmailCode(input: { repository: AuthRepository; email: string; code: string; ipAddress: string; now?: number }): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email) || !/^\d{6}$/.test(input.code)) return { ok: false, reason: "invalid-code" };
  const now = input.now ?? Date.now();
  await input.repository.cleanupAuthData(now);
  const [emailLimit, ipLimit] = await Promise.all([consumeDatabaseLimit(input.repository, VERIFY_EMAIL_LIMIT, email, now), consumeDatabaseLimit(input.repository, VERIFY_IP_LIMIT, input.ipAddress, now)]);
  if (!emailLimit.allowed || !ipLimit.allowed) return { ok: false, reason: "rate-limited" };
  const active = await input.repository.findActiveTokens(email, now, MAX_TOKEN_ATTEMPTS);
  const submittedHash = await sha256Base64Url(input.code);
  let matchedId: string | undefined;
  for (const candidate of active) if (constantTimeEqual(submittedHash, candidate.tokenHash) && !matchedId) matchedId = candidate.id;
  if (!matchedId) { if (active[0]) await input.repository.incrementTokenAttempt(active[0].id, now, MAX_TOKEN_ATTEMPTS); return { ok: false, reason: "invalid-code" }; }
  const [consumed] = await input.repository.consumeToken(matchedId, now, MAX_TOKEN_ATTEMPTS);
  if (!consumed) return { ok: false, reason: "invalid-code" };
  let [user] = await input.repository.findUserByEmail(email);
  if (!user) { await input.repository.createUser({ email }); [user] = await input.repository.findUserByEmail(email); }
  if (!user) return { ok: false, reason: "invalid-code" };
  return { ok: true, sessionToken: await createSession(input.repository, user.id, now), userId: user.id };
}

export async function signInWithGithub(input: { repository: AuthRepository; profile: { id: string; email?: string | null; displayName?: string | null }; now?: number }): Promise<{ sessionToken: string; userId: string } | null> {
  const now = input.now ?? Date.now();
  const account = (await input.repository.findAuthAccount("github", input.profile.id))[0];
  let userId = account?.userId;
  const email = input.profile.email ? normalizeEmail(input.profile.email) : null;
  if (!userId && email && isValidEmail(email)) userId = (await input.repository.findUserByEmail(email))[0]?.id;
  if (!userId) {
    await input.repository.createUser({ email: email && isValidEmail(email) ? email : null, displayName: input.profile.displayName });
    if (email && isValidEmail(email)) userId = (await input.repository.findUserByEmail(email))[0]?.id;
  }
  if (!userId) return null;
  if (!account) {
    const [linked] = await input.repository.linkAuthAccount({ userId, provider: "github", providerAccountId: input.profile.id });
    if (!linked) userId = (await input.repository.findAuthAccount("github", input.profile.id))[0]?.userId ?? userId;
  }
  return { sessionToken: await createSession(input.repository, userId, now), userId };
}

export async function getSessionUser(repository: AuthRepository, sessionToken: string, now = Date.now()) {
  if (!sessionToken) return null;
  return (await repository.findSessionUser(await sha256Base64Url(sessionToken), now))[0] ?? null;
}

export async function revokeSession(repository: AuthRepository, sessionToken: string, now = Date.now()) {
  if (sessionToken) await repository.revokeSession(await sha256Base64Url(sessionToken), now);
}
