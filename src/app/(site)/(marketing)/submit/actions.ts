"use server";

import { redirect } from "next/navigation";

import { FAILURE_STATUSES, type FailureStatus } from "@/domain/product/failure-status";
import type { FormActionState } from "@/lib/forms/action-state";
import { currentUser } from "@/services/auth/current-user";
import { ProductError } from "@/services/product/product-service";
import { createProduct } from "@/services/product/server-product";

const VALID_STATUSES = new Set<string>(FAILURE_STATUSES.map((s) => s.value));

/**
 * Lists a product the signed-in account owns.
 *
 * Listings are owner-only (ADR-012): the owner is the session, and there is no
 * field on this form that could say otherwise.
 */
export async function submitProductAction(
  _previous: FormActionState | null,
  formData: FormData
): Promise<FormActionState> {
  const user = await currentUser();
  if (!user) {
    return { ok: false, message: "Sign in to list a product you built." };
  }

  const failureStatus = String(formData.get("failureStatus") ?? "");
  if (!VALID_STATUSES.has(failureStatus)) {
    return { ok: false, message: "Choose the status that fits best." };
  }

  let slug: string;
  try {
    const created = await createProduct({
      ownerId: user.id,
      name: String(formData.get("name") ?? ""),
      tagline: String(formData.get("tagline") ?? ""),
      description: String(formData.get("description") ?? ""),
      websiteUrl: String(formData.get("websiteUrl") ?? ""),
      failureStatus: failureStatus as FailureStatus,
    });
    slug = created.slug;
  } catch (error) {
    if (error instanceof ProductError) {
      return { ok: false, message: messageFor(error.code) };
    }
    return { ok: false, message: "Could not save this listing. Try again." };
  }

  // Outside the try: redirect() signals by throwing, and catching it here would
  // turn a successful submission into an error message.
  redirect(`/dashboard/products?created=${encodeURIComponent(slug)}`);
}

function messageFor(code: ProductError["code"]): string {
  switch (code) {
    case "INVALID_NAME":
      return "Give the product a name, up to 120 characters.";
    case "INVALID_URL":
      return "The website link must start with http:// or https://.";
    case "SLUG_EXHAUSTED":
      return "That name is heavily used. Try a more specific one.";
    default:
      return "Could not save this listing. Try again.";
  }
}
