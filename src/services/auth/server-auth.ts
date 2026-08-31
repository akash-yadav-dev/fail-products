import { getDb } from "@/db";
import { AuthRepository } from "@/repositories/auth-repository";
import {
  getSessionUser as getSessionUserUseCase,
  requestEmailCode as requestEmailCodeUseCase,
  revokeSession as revokeSessionUseCase,
  signInWithGithub as signInWithGithubUseCase,
  verifyEmailCode as verifyEmailCodeUseCase,
  type SendOtp,
} from "@/services/auth/auth-service";
import { consumeDatabaseLimit } from "@/services/auth/rate-limit";

function repository() {
  return new AuthRepository(getDb());
}

export function requestEmailCode(input: Omit<Parameters<typeof requestEmailCodeUseCase>[0], "repository"> & { sendOtp: SendOtp }) {
  return requestEmailCodeUseCase({ ...input, repository: repository() });
}

export function verifyEmailCode(input: Omit<Parameters<typeof verifyEmailCodeUseCase>[0], "repository">) {
  return verifyEmailCodeUseCase({ ...input, repository: repository() });
}

export function getSessionUser(sessionToken: string, now?: number) {
  return getSessionUserUseCase(repository(), sessionToken, now);
}

export function revokeSession(sessionToken: string, now?: number) {
  return revokeSessionUseCase(repository(), sessionToken, now);
}

export function signInWithGithub(input: Omit<Parameters<typeof signInWithGithubUseCase>[0], "repository">) {
  return signInWithGithubUseCase({ ...input, repository: repository() });
}

export function consumeOauthCallbackLimit(ipAddress: string) {
  return consumeDatabaseLimit(repository(), { name: "oauth-callback-ip", scope: "IP", limit: 20, windowSeconds: 15 * 60 }, ipAddress);
}
