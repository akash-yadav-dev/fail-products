// src/services/user/server-profile.ts
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
