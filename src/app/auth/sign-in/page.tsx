// src/app/auth/sign-in/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SiteLogo } from "@/components/layout/site-logo";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to FailProducts with a one-time email code or with GitHub. No passwords, ever.",
  robots: { index: false, follow: true },
};

export default function SignInPage() {
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

        <CardContent className="flex flex-col gap-4">
          {/* Disabled until the auth service exists. Nothing here submits. */}
          <fieldset disabled className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                className="h-11"
              />
            </div>
            <Button type="button" size="lg" className="h-11 w-full">
              Email me a sign-in code
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 w-full"
            >
              Continue with GitHub
            </Button>
          </fieldset>

          <Alert>
            <AlertTitle>Sign-in is not live yet</AlertTitle>
            <AlertDescription>
              Accounts are not implemented. These controls are disabled on
              purpose so nothing pretends to work.
            </AlertDescription>
          </Alert>
        </CardContent>
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
