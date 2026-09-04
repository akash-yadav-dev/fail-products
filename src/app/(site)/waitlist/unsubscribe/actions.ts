"use server";

import type { FormActionState } from "@/lib/forms/action-state";
import { unsubscribeFromWaitlist } from "@/services/waitlist/server-waitlist";

/**
 * Erases a waitlist entry at its subscriber's request (`docs/LEGAL.md` §5).
 *
 * The token is the whole authorisation. There is no session here — a
 * subscriber is not an account, and requiring one to leave a list somebody may
 * have put them on without asking would be the opposite of an erasure route.
 *
 * The answer is the same whether a row was deleted or the token matched
 * nothing. Distinguishing them would let anyone holding a guessed token learn
 * whether an address is on a product's list, and there is nothing a subscriber
 * can do differently with the distinction.
 */
export async function unsubscribeAction(
  _previous: FormActionState | null,
  formData: FormData
): Promise<FormActionState> {
  try {
    await unsubscribeFromWaitlist({ token: formData.get("token") });
  } catch {
    return {
      ok: false,
      message: "That did not go through. Try the link in your email again.",
    };
  }

  return {
    ok: true,
    message:
      "Removed. Your address is deleted, not flagged — there is no record left to write to.",
  };
}
