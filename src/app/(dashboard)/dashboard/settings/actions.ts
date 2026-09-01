"use server";

import { revalidatePath } from "next/cache";

import type { FormActionState } from "@/lib/forms/action-state";
import { currentUser } from "@/services/auth/current-user";
import { ProfileValidationError } from "@/services/user/profile-service";
import { updateProfile } from "@/services/user/server-profile";

/**
 * Saves the signed-in account's public profile.
 *
 * parse → authenticate → authorize → domain → persist → safe response. The
 * account is taken from the session, never from the form: a `userId` field in
 * the payload would be an assertion by the caller, not a fact (`AGENTS.md` §7).
 */
export async function updateProfileAction(
  _previous: FormActionState | null,
  formData: FormData
): Promise<FormActionState> {
  const user = await currentUser();
  if (!user) {
    return { ok: false, message: "Sign in again to save your profile." };
  }

  try {
    const result = await updateProfile({
      userId: user.id,
      username: String(formData.get("username") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      bio: String(formData.get("bio") ?? ""),
      websiteUrl: String(formData.get("websiteUrl") ?? ""),
    });

    if (!result.changed) {
      return { ok: true, message: "Nothing to save." };
    }

    // The public profile renders from this data, so it has to be refreshed too.
    revalidatePath("/dashboard/settings");
    revalidatePath("/u/[username]", "page");

    return { ok: true, message: "Profile saved." };
  } catch (error) {
    // The validation errors carry messages written for a person to read. Any
    // other failure gets a generic one: an unexpected error must never put its
    // internals on the page (docs/ENGINEERING.md §11).
    if (error instanceof ProfileValidationError) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Could not save your profile. Try again." };
  }
}
