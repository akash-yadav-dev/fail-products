// src/lib/forms/action-state.ts
/**
 * The shape every Server Action returns to a form.
 *
 * Lives here rather than beside the actions because a `"use server"` module may
 * only export async functions — a type exported from one is a build error.
 */
export type FormActionState = {
  readonly ok: boolean;
  readonly message: string;
};

export const IDLE: FormActionState = { ok: true, message: "" };
