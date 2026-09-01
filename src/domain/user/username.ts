// src/domain/user/username.ts
import { isReservedName } from "@/domain/shared/reserved-names";

/**
 * Username rules.
 *
 * A username is a public URL (`/u/[username]`), which makes it part of the same
 * namespace ADR-019 reserves words in — and makes it far harder to change than
 * an ordinary profile field, because changing it breaks every link anyone has
 * shared.
 *
 * Domain code imports nothing from Next.js, React, or any provider.
 */

/** Matches `varchar(39)` on `users.username`. */
export const USERNAME_MAX_LENGTH = 39;

/**
 * Two, not one.
 *
 * Single-character handles are the scarcest names in any namespace and the ones
 * most fought over. Withholding them costs nothing now and keeps the decision
 * open; issuing them is irreversible.
 */
export const USERNAME_MIN_LENGTH = 2;

export type UsernameRejection =
  | "EMPTY"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "INVALID_CHARACTERS"
  | "EDGE_HYPHEN"
  | "CONSECUTIVE_HYPHENS"
  | "RESERVED";

export type UsernameResult =
  | { readonly ok: true; readonly username: string; readonly lowercased: string }
  | { readonly ok: false; readonly reason: UsernameRejection };

/** A human-readable explanation. The UI shows these; they never name internals. */
export const USERNAME_MESSAGES: Readonly<Record<UsernameRejection, string>> = {
  EMPTY: "Choose a username.",
  TOO_SHORT: `Usernames are at least ${USERNAME_MIN_LENGTH} characters.`,
  TOO_LONG: `Usernames are at most ${USERNAME_MAX_LENGTH} characters.`,
  INVALID_CHARACTERS: "Use letters, numbers, and hyphens only.",
  EDGE_HYPHEN: "Usernames cannot start or end with a hyphen.",
  CONSECUTIVE_HYPHENS: "Usernames cannot contain two hyphens in a row.",
  RESERVED: "That username is not available.",
};

/**
 * Validates a username and returns both the display form and the form
 * uniqueness is enforced on.
 *
 * Case is preserved for display and lowercased for comparison, so "Akash" and
 * "akash" are the same handle and cannot both be registered — the database
 * enforces that with a unique index on `username_lower`, and this function
 * supplies the value it indexes.
 *
 * RESERVED is deliberately not distinguished from "already taken" in the
 * message. Telling an attacker which handles exist is a small leak, and
 * telling them which are reserved is a map of the routing table.
 */
export function validateUsername(input: string): UsernameResult {
  const username = input.trim();

  if (username.length === 0) return { ok: false, reason: "EMPTY" };
  if (username.length < USERNAME_MIN_LENGTH) return { ok: false, reason: "TOO_SHORT" };
  if (username.length > USERNAME_MAX_LENGTH) return { ok: false, reason: "TOO_LONG" };

  // ASCII only. A handle that renders identically to another one in a different
  // script is an impersonation vector that no moderation queue catches reliably.
  if (!/^[A-Za-z0-9-]+$/.test(username)) {
    return { ok: false, reason: "INVALID_CHARACTERS" };
  }
  if (username.startsWith("-") || username.endsWith("-")) {
    return { ok: false, reason: "EDGE_HYPHEN" };
  }
  if (username.includes("--")) {
    return { ok: false, reason: "CONSECUTIVE_HYPHENS" };
  }

  const lowercased = username.toLowerCase();
  if (isReservedName(lowercased)) {
    return { ok: false, reason: "RESERVED" };
  }

  return { ok: true, username, lowercased };
}
