"use server";

import { revalidatePath } from "next/cache";

import { isCommentModerationState } from "@/domain/comment/moderation";
import { MODERATION_STATES } from "@/domain/product/transitions";
import type { FormActionState } from "@/lib/forms/action-state";
import { currentUser } from "@/services/auth/current-user";
import { ModerationError } from "@/services/moderation/moderation-service";
import {
  moderateComment,
  moderateProduct,
  resolveReport,
} from "@/services/moderation/server-moderation";

/**
 * The moderator's three actions.
 *
 * Each takes its actor from the session and re-checks the role in the service,
 * against the database (`docs/SECURITY.md` §3). Nothing here trusts that the
 * caller reached this module through a page that already checked — a Server
 * Action is a public endpoint, reachable by anybody who can construct the
 * request, and the page around it is not a gate.
 */

export async function hideCommentAction(
  _previous: FormActionState | null,
  formData: FormData
): Promise<FormActionState> {
  const user = await currentUser();
  const to = String(formData.get("to") ?? "");

  if (!isCommentModerationState(to)) {
    return { ok: false, message: "That is not a state a comment can be in." };
  }

  try {
    const result = await moderateComment({
      viewer: { userId: user?.id ?? null },
      commentId: String(formData.get("commentId") ?? ""),
      to,
      reason: formData.get("reason"),
      reportId: asOptionalId(formData.get("reportId")),
    });

    // The product page is prerendered (ADR-027). Without this, a comment a
    // moderator has just hidden stays on the public page for up to five
    // minutes — which is the window an active incident happens inside.
    revalidatePath("/products/" + result.productSlug);
    revalidatePath("/dashboard/moderation");

    return { ok: true, message: `Comment ${result.moderationState.toLowerCase()}.` };
  } catch (error) {
    return failure(error);
  }
}

export async function moderateProductAction(
  _previous: FormActionState | null,
  formData: FormData
): Promise<FormActionState> {
  const user = await currentUser();
  const to = String(formData.get("to") ?? "");

  if (!(MODERATION_STATES as readonly string[]).includes(to)) {
    return { ok: false, message: "That is not a moderation state." };
  }

  try {
    const result = await moderateProduct({
      viewer: { userId: user?.id ?? null },
      productId: String(formData.get("productId") ?? ""),
      to: to as (typeof MODERATION_STATES)[number],
      reason: formData.get("reason"),
      reportId: asOptionalId(formData.get("reportId")),
    });

    revalidatePath("/products/" + result.slug);
    revalidatePath("/dashboard/moderation");

    return { ok: true, message: `Listing ${result.moderationState.toLowerCase()}.` };
  } catch (error) {
    return failure(error);
  }
}

export async function resolveReportAction(
  _previous: FormActionState | null,
  formData: FormData
): Promise<FormActionState> {
  const user = await currentUser();

  try {
    await resolveReport({
      viewer: { userId: user?.id ?? null },
      reportId: String(formData.get("reportId") ?? ""),
      status: formData.get("status"),
      note: formData.get("note"),
    });

    revalidatePath("/dashboard/moderation");

    return { ok: true, message: "Report closed." };
  } catch (error) {
    return failure(error);
  }
}

/** An empty hidden field is absent, not an id. */
function asOptionalId(value: FormDataEntryValue | null): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  return id.length > 0 ? id : null;
}

function failure(error: unknown): FormActionState {
  if (!(error instanceof ModerationError)) {
    return { ok: false, message: "That did not go through. Try again." };
  }

  switch (error.code) {
    case "NOT_SIGNED_IN":
    case "FORBIDDEN":
      // The same answer for both, and deliberately uninformative: a moderation
      // endpoint must not confirm to a stranger that it exists and works.
      return { ok: false, message: "Not found." };
    case "REASON_REQUIRED":
      return {
        ok: false,
        message: "Say why. An action with no recorded reason cannot be appealed.",
      };
    case "ALREADY_RESOLVED":
      return { ok: false, message: "Somebody already closed this one." };
    case "ILLEGAL_TRANSITION":
      return { ok: false, message: "It is already in that state." };
    case "TARGET_NOT_FOUND":
    case "REPORT_NOT_FOUND":
      return { ok: false, message: "That is no longer here." };
    default:
      return { ok: false, message: "That did not go through. Try again." };
  }
}
