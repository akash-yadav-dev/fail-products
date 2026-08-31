// src/app/(dashboard)/dashboard/settings/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";

export const metadata: Metadata = {
  title: "Settings",
  description: "Your public profile on FailProducts.",
  robots: { index: false, follow: false },
};

export default function DashboardSettingsPage() {
  return (
    <>
      <DashboardPageHeader
        title="Settings"
        description="Your public profile, and how people reach you from a listing."
      />

      <Card>
        <CardHeader>
          <CardTitle>Public profile</CardTitle>
          <CardDescription>
            What people see at your profile URL. Disabled until accounts exist.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Disabled until the account service exists. Nothing here submits. */}
          <fieldset disabled className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input id="display-name" name="displayName" className="h-11" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" name="username" className="h-11" />
                <p className="text-xs text-muted-foreground">
                  Your profile lives at /u/your-username.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" name="bio" rows={4} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name="website"
                type="url"
                inputMode="url"
                className="h-11"
              />
            </div>
          </fieldset>
        </CardContent>

        <CardFooter className="flex-col items-start gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground text-pretty">
            Sign-in is passwordless — a link by email, or GitHub. Neither is
            wired up yet.
          </p>
          <Button disabled className="h-10">
            Save changes
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>
            Leaving, and taking your listings with you.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p className="text-pretty">
            Delisting a product you own, and deleting an account, are both
            covered by the takedown policy rather than by a button here.
          </p>
          <Separator />
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-10">
              <Link href="/takedown">Takedown and delisting</Link>
            </Button>
            <Button asChild variant="ghost" className="h-10">
              <Link href="/privacy">Privacy policy</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
