// src/services/user/server-profile.ts
import { cache } from "react";

import { getDb } from "@/db";
import { UserRepository } from "@/repositories/user-repository";
import {
  getPublicProfile as getPublicProfileUseCase,
  updateProfile as updateProfileUseCase,
} from "@/services/user/profile-service";

/**
 * The server-side binding for the profile use cases.
 * Mirrors `src/services/auth/server-auth.ts`.
 */

function repository() {
  return new UserRepository(getDb());
}

export function getPublicProfile(username: string) {
  return getPublicProfileUseCase(repository(), username);
}

export function getOwnProfile(userId: string) {
  return repository().findById(userId);
}

export function updateProfile(
  input: Omit<Parameters<typeof updateProfileUseCase>[0], "repository">
) {
  return updateProfileUseCase({ ...input, repository: repository() });
}

/**
 * One account's role, read at most once per request.
 *
 * `cache()` is request-scoped, so this keeps the property
 * `docs/SECURITY.md` §3 actually requires — the role is re-read from the
 * database on **every request**, never carried in the session, so a demoted
 * moderator loses access at their next action rather than their next sign-in —
 * while removing the repeats within one request. The moderation dashboard
 * asked three times for a fact that cannot change between them: once to decide
 * what to render, then once inside each of the two service calls it makes.
 * neon-http bills a round trip per statement, so two of those three were pure
 * latency.
 *
 * Deliberately not memoised any wider than a request. A cache that outlived
 * one would be the session-cached role this comment exists to rule out.
 */
export const findUserRole = cache(
  async (userId: string): Promise<string | null> => repository().findRole(userId)
);

/**
 * Whether an account currently holds the moderator role.
 *
 * Decides what the dashboard *shows*; the service layer re-checks it before it
 * acts, because a Server Action is reachable without a page ever rendering.
 */
export async function isModerator(userId: string): Promise<boolean> {
  return (await findUserRole(userId)) === "MODERATOR";
}
