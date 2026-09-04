"use server";

import { revalidatePath } from "next/cache";

import type { FormActionState } from "@/lib/forms/action-state";
import { ProductAccessError } from "@/domain/product/permissions";
import { currentUser } from "@/services/auth/current-user";
import { ProductError } from "@/services/product/product-service";
import { setWaitlistEnabled } from "@/services/product/server-product";

/**
 * The owner's waitlist switch (Phase 4 slice 4.1).
 *
 * The actor comes from the session and the product is re-loaded and authorised
 * in the service (`AGENTS.md` §7). Nothing here trusts that the caller reached
 * this module through a dashboard page that already checked — a Server Action
 * is a public endpoint, and the page around it is not a gate.
 *
 * Turning the waitlist off stops new signups and **does not delete anything**.
 * Addresses already given were given under a consent that has not been
 * withdrawn; erasing them because a founder flipped a switch would destroy
 * their list on a misclick, and erasure is the subscriber's decision to make
 * (`docs/LEGAL.md` §5).
 */
export async function setWaitlistEnabledAction(
  _previous: FormActionState | null,
  formData: FormData
): Promise<FormActionState> {
  const user = await currentUser();

  // An unchecked checkbox posts nothing, so the desired state is carried
  // explicitly rather than inferred from the field's presence — the form is a
  // pair of one-way buttons, not a toggle that submits itself.
  const enabled = formData.get("enabled") === "true";

  try {
    const result = await setWaitlistEnabled({
      viewer: { userId: user?.id ?? null },
      productId: String(formData.get("productId") ?? ""),
      enabled,
    });

    revalidatePath("/dashboard/products");

    return {
      ok: true,
      message: result.waitlistEnabled
        ? "Waitlist on. The product page now asks visitors for their email."
        : "Waitlist off. Addresses you already have are untouched.",
    };
  } catch (error) {
    // The same answer for "no such product" and "not yours". An authorization
    // failure that reads differently from a missing record is a way to find
    // out which product ids exist (`docs/SECURITY.md` §3).
    if (error instanceof ProductAccessError || error instanceof ProductError) {
      return { ok: false, message: "Not found." };
    }
    return { ok: false, message: "That did not go through. Try again." };
  }
}
