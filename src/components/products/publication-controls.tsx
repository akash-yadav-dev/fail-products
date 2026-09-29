"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  allowedPublicationTargets,
  type PublicationState,
} from "@/domain/product/transitions";
import type { FormActionState } from "@/lib/forms/action-state";

type PublicationAction = (
  state: FormActionState | null,
  formData: FormData
) => Promise<FormActionState>;

/**
 * The order the buttons appear in — most likely intent first.
 *
 * Not the raw output of `allowedPublicationTargets`, which is ordered for the
 * graph rather than for a person: a live listing should offer "Unpublish"
 * before "Archive", and a draft should offer "Publish" first. Filtering this
 * list by what the graph allows keeps the two in step without restating the
 * transitions here.
 *
 * `PENDING_REVIEW` is a queue position with no queue behind it — nothing moves
 * a listing into it and nothing processes it — so it is not offered. It stays
 * legal in the state machine for when a review flow exists.
 */
const PREFERRED_ORDER: readonly PublicationState[] = [
  "PUBLISHED",
  "DRAFT",
  "ARCHIVED",
];

function labelFor(from: PublicationState, to: PublicationState): string {
  if (to === "DRAFT") {
    return from === "PUBLISHED" ? "Unpublish" : "Move to draft";
  }

  switch (to) {
    case "PUBLISHED":
      return from === "ARCHIVED" ? "Republish" : "Publish";
    case "ARCHIVED":
      return "Archive";
    default:
      return "Send for review";
  }
}

/**
 * The owner's publish controls for one listing.
 *
 * A submit button per legal move rather than a single toggle: the destination
 * is the payload, and the set of destinations is the state machine's answer,
 * not this component's opinion. Publishing is the move that was missing
 * entirely — a draft had no control anywhere that could make it public.
 *
 * The Edit link sits here rather than in its own column so every control for a
 * listing is in one place, and so the primary action survives to 360px in the
 * name cell (the same reasoning that moved the moderation notice there).
 */
export function PublicationControls({
  productId,
  publicationState,
  action,
}: {
  productId: string;
  publicationState: PublicationState;
  action: PublicationAction;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  const allowed = allowedPublicationTargets(publicationState, "OWNER");
  const targets = PREFERRED_ORDER.filter((to) => allowed.includes(to));

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="ghost" className="h-9">
          <Link href={`/dashboard/products/${productId}/edit`}>Edit</Link>
        </Button>

        {targets.map((to, index) => (
          <form key={to} action={formAction}>
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="to" value={to} />
            <Button
              type="submit"
              size="sm"
              // The first button is the one a founder usually wants: publish
              // for a draft, unpublish for a live listing.
              variant={index === 0 ? "secondary" : "outline"}
              disabled={pending}
              className="h-9"
            >
              {pending ? "Working…" : labelFor(publicationState, to)}
            </Button>
          </form>
        ))}
      </div>

      {state && state.message ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
