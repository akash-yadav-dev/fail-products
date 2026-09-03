"use client";

import { useActionState, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PRODUCT_CATEGORIES } from "@/domain/product/category";
import { FAILURE_STATUSES } from "@/domain/product/failure-status";
import type { FormActionState } from "@/lib/forms/action-state";

/**
 * The "Not sure yet" value.
 *
 * Radix rejects an empty string as an item value, so the absence of a choice
 * needs a name of its own inside the select. It is mapped back to an empty
 * field before it is posted, and never reaches the server.
 */
const NO_CATEGORY = "__none__";

type SubmitAction = (
  state: FormActionState | null,
  formData: FormData
) => Promise<FormActionState>;

/**
 * The listing form.
 *
 * Creates a **draft**. Nothing here publishes: a listing goes public from the
 * dashboard, deliberately as a second, separate decision.
 */
export function SubmitForm({ action }: { action: SubmitAction }) {
  const [state, formAction, pending] = useActionState(action, null);
  // Controlled only so each choice's description can be shown below its
  // trigger rather than inside it. Both values still reach the server as
  // ordinary form fields and are validated there.
  const [categorySlug, setCategorySlug] = useState<string>("");
  const [failureStatus, setFailureStatus] = useState<string>("");
  const chosenCategory = PRODUCT_CATEGORIES.find((c) => c.slug === categorySlug);
  const chosenStatus = FAILURE_STATUSES.find((s) => s.value === failureStatus);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Product name</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={120}
          className="h-11"
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tagline">Tagline</Label>
        <Input
          id="tagline"
          name="tagline"
          maxLength={200}
          className="h-11"
          placeholder="One line on what it did."
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="websiteUrl">Website</Label>
        <Input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          inputMode="url"
          placeholder="https://example.com"
          className="h-11"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="failureStatus">Status</Label>
        {/*
          No defaultValue, for the reason the category select already gives —
          but with more force here. This field drives the badge, the status
          page, and the sentence "The founder listed X as abandoned", and
          docs/LEGAL.md §3 rests on that being the founder's own words. Pinned
          to ABANDONED, a founder who never opened the select published a claim
          about their own live product that they never made. The placeholder
          already exists and submitProductAction already answers a missing
          value with "Choose the status that fits best."
        */}
        <Select
          name="failureStatus"
          value={failureStatus}
          onValueChange={setFailureStatus}
        >
          <SelectTrigger
            id="failureStatus"
            aria-describedby="failureStatus-hint"
            className="h-11"
          >
            <SelectValue placeholder="What is it doing now?" />
          </SelectTrigger>
          <SelectContent>
            {/*
              The label only. The description in the item also lands in the
              trigger, where it clamps to one line and truncates the founder's
              own answer behind help text they have already read.
            */}
            {FAILURE_STATUSES.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id="failureStatus-hint" className="text-muted-foreground text-sm">
          {chosenStatus
            ? chosenStatus.description
            : "How the product ended, in your words. You can change it later."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="categorySlug">Category</Label>
        {/*
          A fixed list, not a text field (ADR-026). Free-form categories turn
          every typo into its own indexable page, which docs/PRODUCT.md §9
          forbids. The value is still validated server-side — a <select> is a
          suggestion, and this is an ordinary form post.
        */}
        <p id="categorySlug-rule" className="text-muted-foreground text-sm">
          Pick what the product was <em>for</em>, not how it was sold. Choose
          SaaS or Marketplace only when no other category fits.
        </p>
        {/*
          No defaultValue. "Other" is a legitimate answer and stays one keystroke
          away, but as the default it was an answer nobody gave — a founder who
          never opened the select filed under the junk drawer ADR-026 warns will
          accumulate, and the row then reads like a decision. Leaving it unset
          shows the placeholder and posts nothing, which the service already
          accepts as no category (tests/integration/category-taxonomy.test.ts,
          "allows no category at all"). Silence is recoverable; a wrong answer
          that looks like an answer is not.
        */}
        {/*
          The value is posted by the hidden input below rather than by the
          select's own name, so NO_CATEGORY can mean "no category" on the wire
          instead of being sent as a slug the server would reject. A Radix
          Select offers no way back to unselected once a value is chosen, so
          without an explicit item the choice was one-way — on a form that is
          currently a founder's only shot at their own record, there being no
          edit surface yet (docs/MODERATION.md §7).
        */}
        <input
          type="hidden"
          name="categorySlug"
          value={categorySlug === NO_CATEGORY ? "" : categorySlug}
        />
        <Select value={categorySlug} onValueChange={setCategorySlug}>
          <SelectTrigger
            id="categorySlug"
            aria-describedby="categorySlug-rule"
            className="h-11"
          >
            <SelectValue placeholder="What kind of product was it?" />
          </SelectTrigger>
          <SelectContent>
            {/*
              The name only. Putting the description in the item also puts it in
              the trigger, because SelectValue renders the chosen item children
              and the trigger clamps to one line — so a founder who picked AI
              saw "AI — Models, assistants, agen…", their own answer truncated
              behind help text they had already read. The description belongs
              below the trigger, which is what report-dialog.tsx does.
            */}
            {PRODUCT_CATEGORIES.map((category) => (
              <SelectItem key={category.slug} value={category.slug}>
                {category.name}
              </SelectItem>
            ))}
            <SelectItem value={NO_CATEGORY}>Not sure yet</SelectItem>
          </SelectContent>
        </Select>
        {chosenCategory ? (
          <p className="text-muted-foreground text-sm">
            {chosenCategory.description}
          </p>
        ) : categorySlug === NO_CATEGORY ? (
          <p className="text-muted-foreground text-sm">
            Filed under no category. It will not appear on a category page
            until you pick one.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">What happened</Label>
        <Textarea
          id="description"
          name="description"
          rows={8}
          placeholder="What you set out to build, what went wrong, and what you would do differently."
        />
      </div>

      {state && state.message ? (
        <Alert variant={state.ok ? "default" : "destructive"} role="status" aria-live="polite">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div>
        <Button type="submit" size="lg" className="h-11" disabled={pending}>
          {pending ? "Saving…" : "Save as draft"}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          Saved as a draft. Nothing is public until you publish it from your
          dashboard.
        </p>
      </div>
    </form>
  );
}
