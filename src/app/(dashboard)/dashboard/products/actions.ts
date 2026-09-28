"use server";

import { revalidatePath } from "next/cache";

import {
  FAILURE_STATUSES,
  type FailureStatus,
} from "@/domain/product/failure-status";
import { ProductAccessError } from "@/domain/product/permissions";
import {
  PUBLICATION_STATES,
  type PublicationState,
} from "@/domain/product/transitions";
import type { FormActionState } from "@/lib/forms/action-state";
import { currentUser } from "@/services/auth/current-user";
import { ProductError } from "@/services/product/product-service";
import {
  changeFailureStatus,
  changePublicationState,
  setWaitlistEnabled,
  updateProduct,
} from "@/services/product/server-product";

const VALID_STATUSES = new Set<string>(FAILURE_STATUSES.map((s) => s.value));

/**
 * The owner's controls for one of their listings.
 *
 * Each action takes its actor from the session and the product is re-loaded and
 * authorised in the service (`AGENTS.md` §7). Nothing here trusts that the
 * caller reached this module through a dashboard that already checked — a
 * Server Action is a public endpoint, and the page around it is not a gate.
 */

/**
 * The owner's waitlist switch (Phase 4 slice 4.1).
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
    return failure(error);
  }
}

/**
 * The owner's publish switch — the link that was missing.
 *
 * A submitted listing is created as a `DRAFT`, and until this existed nothing
 * in the application could move it out of that state: the use case was
 * implemented and tested with no caller, so the directory could not be filled
 * through the product (`.plans/2026-09-14-launch-readiness-findings.md`).
 *
 * The legal moves are the state machine's, not this file's. An illegal pair is
 * rejected in the service with `ILLEGAL_TRANSITION` whatever the form posts, so
 * the accepted set here cannot drift from `PUBLICATION_TRANSITIONS`.
 */
export async function setPublicationStateAction(
  _previous: FormActionState | null,
  formData: FormData
): Promise<FormActionState> {
  const user = await currentUser();
  const to = String(formData.get("to") ?? "");

  // The enum check is the boundary, not the rule: it keeps a junk value out of
  // a typed call, and the transition graph still decides what is allowed.
  if (!(PUBLICATION_STATES as readonly string[]).includes(to)) {
    return { ok: false, message: "That is not a publication state." };
  }

  try {
    const result = await changePublicationState({
      viewer: { userId: user?.id ?? null },
      productId: String(formData.get("productId") ?? ""),
      to: to as PublicationState,
    });

    revalidatePath("/dashboard/products");

    return {
      ok: true,
      message: publicationMessage(result.publicationState as PublicationState, result.isPublic),
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Edits a listing's details.
 *
 * A rename retires the old slug and moves to a new one (ADR-019), so the old
 * URL keeps resolving. The binding invalidates both public paths; this only
 * revalidates the two dashboard ones.
 */
export async function updateProductAction(
  _previous: FormActionState | null,
  formData: FormData
): Promise<FormActionState> {
  const user = await currentUser();
  const productId = String(formData.get("productId") ?? "");

  try {
    await updateProduct({
      viewer: { userId: user?.id ?? null },
      productId,
      name: String(formData.get("name") ?? ""),
      tagline: String(formData.get("tagline") ?? ""),
      description: String(formData.get("description") ?? ""),
      websiteUrl: String(formData.get("websiteUrl") ?? ""),
    });

    revalidatePath("/dashboard/products");
    revalidatePath(`/dashboard/products/${productId}/edit`);

    return { ok: true, message: "Saved." };
  } catch (error) {
    return failure(error);
  }
}

/**
 * The owner's factual status change.
 *
 * A separate action from the details form on purpose: `failure_status` and the
 * listing's fields are different things (ADR-013), and a founder correcting
 * their own record should not have to save an unrelated edit to do it. Every
 * pair is legal except a no-op (`canTransitionFailureStatus`), so nothing here
 * filters the options.
 */
export async function changeFailureStatusAction(
  _previous: FormActionState | null,
  formData: FormData
): Promise<FormActionState> {
  const user = await currentUser();
  const productId = String(formData.get("productId") ?? "");
  const to = String(formData.get("to") ?? "");

  if (!VALID_STATUSES.has(to)) {
    return { ok: false, message: "Choose the status that fits best." };
  }

  try {
    await changeFailureStatus({
      viewer: { userId: user?.id ?? null },
      productId,
      to: to as FailureStatus,
    });

    revalidatePath("/dashboard/products");
    revalidatePath(`/dashboard/products/${productId}/edit`);

    return { ok: true, message: "Status updated." };
  } catch (error) {
    return failure(error);
  }
}

function publicationMessage(state: PublicationState, isPublic: boolean): string {
  switch (state) {
    case "PUBLISHED":
      return isPublic
        ? "Published. It is on the public directory now."
        : "Published, but hidden from the public directory by moderation.";
    case "DRAFT":
      return "Moved to draft. It is off the public directory.";
    case "ARCHIVED":
      return "Archived. It is off the public directory.";
    default:
      return "Saved.";
  }
}

/**
 * One answer per failure.
 *
 * "No such product" and "not yours" both return the same message: an
 * authorization failure that reads differently from a missing record is a way
 * to find out which product ids exist (`docs/SECURITY.md` §3).
 */
function failure(error: unknown): FormActionState {
  if (error instanceof ProductAccessError) {
    return { ok: false, message: "Not found." };
  }

  if (error instanceof ProductError) {
    switch (error.code) {
      case "NOT_FOUND":
      case "FORBIDDEN":
        return { ok: false, message: "Not found." };
      case "RATE_LIMITED":
        return { ok: false, message: "Too many changes. Try again in ten minutes." };
      case "ILLEGAL_TRANSITION":
        return {
          ok: false,
          message: "That change is not allowed from where the listing is now.",
        };
      case "INVALID_NAME":
        return { ok: false, message: "Give the product a name, up to 120 characters." };
      case "INVALID_URL":
        return { ok: false, message: "The website link must start with http:// or https://." };
      case "INVALID_CATEGORY":
        return { ok: false, message: "Pick a category from the list." };
      case "SLUG_EXHAUSTED":
        return { ok: false, message: "That name is heavily used. Try a more specific one." };
      default:
        return { ok: false, message: "That did not go through. Try again." };
    }
  }

  return { ok: false, message: "That did not go through. Try again." };
}
