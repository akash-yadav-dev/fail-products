"use server";

import { headers } from "next/headers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ACCOUNT_HINT_COOKIE,
  accountHintCookieOptions,
} from "@/lib/auth/account-hint";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth/session-cookie";
import {
} from "@/services/auth/server-auth";
import { requestEmailCode, verifyEmailCode, revokeSession } from "@/services/auth/server-auth";
import { sendSignInCode } from "@/services/auth/email-delivery";
import type { AuthActionState } from "@/lib/auth/action-state";

export type { AuthActionState } from "@/lib/auth/action-state";

async function requestIpAddress(): Promise<string> {
  const requestHeaders = await headers();
  return requestHeaders.get("cf-connecting-ip") ?? "unknown";
}

export async function requestCodeAction(
  _previous: AuthActionState | null,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const result = await requestEmailCode({
    email,
    ipAddress: await requestIpAddress(),
    sendOtp: sendSignInCode,
  });
  if (!result.ok) {
    return {
      ok: false,
      message: result.reason === "invalid-email" ? "Enter a valid email address." : "Try again later.",
    };
  }
  return {
    ok: true,
    email: email.trim().toLowerCase(),
    message: "If this address can sign in, a code is on its way. It expires in 10 minutes.",
  };
}

export async function verifyCodeAction(
  _previous: AuthActionState | null,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const code = String(formData.get("code") ?? "");
  const result = await verifyEmailCode({
    email,
    code,
    ipAddress: await requestIpAddress(),
  });
  if (!result.ok) {
    return { ok: false, message: "That code is invalid or expired. Request a new one and try again." };
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, result.sessionToken, SESSION_COOKIE_OPTIONS);
  // Paired with the session, always. A hint left behind after sign-out shows a
  // comment form to somebody who cannot use it; a hint missing after sign-in
  // hides one from somebody who can. Both are cosmetic, and both are avoidable.
  store.set(ACCOUNT_HINT_COOKIE, "1", accountHintCookieOptions());
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await revokeSession(token);
  }
  store.delete(SESSION_COOKIE);
  store.delete(ACCOUNT_HINT_COOKIE);
}
