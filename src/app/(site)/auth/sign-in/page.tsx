// src/app/auth/sign-in/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SiteLogo } from "@/components/layout/site-logo";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safeNextPath } from "@/lib/urls/next-path";
import { requestCodeAction, verifyCodeAction } from "@/app/(site)/auth/actions";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to FailProducts with a one-time email code or with GitHub. No passwords, ever.",
  robots: { index: false, follow: true },
};

/*
 * Reading searchParams makes this route dynamic. That is acceptable here and
 * nowhere near ADR-027 territory: sign-in is noindex, is never a crawlable list
 * page, and has nothing worth caching — every visit is a person about to
 * authenticate.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const raw = (await searchParams).next;
  // Validated here as well as in the action. Here it keeps an unusable value
  // out of the form; there it is the check that actually protects the redirect,
  // because the form field is client-supplied either way.
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <SiteLogo size="md" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            FailProducts is passwordless. You get a one-time code by email, or
            you sign in with GitHub.
          </CardDescription>
        </CardHeader>

        <CardContent><SignInForm requestAction={requestCodeAction} verifyAction={verifyCodeAction} next={next} /></CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground text-pretty">
        By signing in you will agree to the{" "}
        <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
          Terms
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
