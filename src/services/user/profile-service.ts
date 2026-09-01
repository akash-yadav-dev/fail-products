// src/services/user/profile-service.ts
import { USERNAME_MESSAGES, validateUsername } from "@/domain/user/username";
import { normaliseExternalUrl } from "@/lib/validation/url";
import type { UserRepository } from "@/repositories/user-repository";

/**
 * Profile use cases.
 *
 * The repository is injected rather than imported, so these run against a test
 * database with no framework involved.
 */

export type ProfileError =
  | "NOT_FOUND"
  | "USERNAME_INVALID"
  | "USERNAME_TAKEN"
  | "INVALID_URL"
  | "BIO_TOO_LONG";

export class ProfileValidationError extends Error {
  constructor(
    readonly code: ProfileError,
    message: string
  ) {
    super(message);
    this.name = "ProfileValidationError";
  }
}

const MAX_BIO_LENGTH = 500;
/** Matches `varchar(80)` on `users.display_name`. */
const MAX_DISPLAY_NAME_LENGTH = 80;

/** The public profile for `/u/[username]`, or null so the page can 404. */
export async function getPublicProfile(
  repository: UserRepository,
  username: string
) {
  return repository.findByUsername(username);
}

/**
 * Writes a profile.
 *
 * The username is only touched when it actually changes. Rewriting it on every
 * save would burn a uniqueness check and, worse, make a no-op save able to fail
 * for a handle the account already holds.
 */
export async function updateProfile(input: {
  repository: UserRepository;
  userId: string;
  username?: string;
  displayName?: string | null;
  bio?: string | null;
  websiteUrl?: string | null;
}) {
  const current = await input.repository.findById(input.userId);
  if (!current) throw new ProfileValidationError("NOT_FOUND", "Not found");

  const fields: {
    username?: string;
    usernameLower?: string;
    displayName?: string | null;
    bio?: string | null;
    websiteUrl?: string | null;
  } = {};

  if (input.username !== undefined) {
    const result = validateUsername(input.username);
    if (!result.ok) {
      throw new ProfileValidationError(
        "USERNAME_INVALID",
        USERNAME_MESSAGES[result.reason]
      );
    }

    if (result.lowercased !== current.usernameLower) {
      const available = await input.repository.isUsernameAvailable(
        result.lowercased,
        input.userId
      );
      if (!available) {
        // Deliberately the same wording as the reserved-name rejection, so the
        // response does not enumerate which handles exist.
        throw new ProfileValidationError(
          "USERNAME_TAKEN",
          "That username is not available."
        );
      }

      // Always written as a pair: updating one without the other would defeat
      // the unique index that makes handles case-insensitive.
      fields.username = result.username;
      fields.usernameLower = result.lowercased;
    }
  }

  if (input.displayName !== undefined) {
    const trimmed = input.displayName?.trim();
    fields.displayName = trimmed ? trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH) : null;
  }

  if (input.bio !== undefined) {
    const trimmed = input.bio?.trim();
    if (trimmed && trimmed.length > MAX_BIO_LENGTH) {
      throw new ProfileValidationError(
        "BIO_TOO_LONG",
        `Keep your bio under ${MAX_BIO_LENGTH} characters.`
      );
    }
    fields.bio = trimmed || null;
  }

  if (input.websiteUrl !== undefined) {
    const raw = input.websiteUrl?.trim();
    if (!raw) {
      fields.websiteUrl = null;
    } else {
      const normalised = normaliseExternalUrl(raw);
      if (!normalised) {
        throw new ProfileValidationError(
          "INVALID_URL",
          "Enter a link starting with http:// or https://."
        );
      }
      fields.websiteUrl = normalised;
    }
  }

  if (Object.keys(fields).length === 0) {
    return { id: input.userId, changed: false };
  }

  await input.repository.updateProfile(input.userId, fields);
  return { id: input.userId, changed: true };
}
