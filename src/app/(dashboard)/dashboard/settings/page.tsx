// src/app/(dashboard)/dashboard/settings/page.tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { currentUserOrNull } from "@/services/auth/current-user";
import { getOwnProfile } from "@/services/user/server-profile";
import { updateProfileAction } from "./actions";

export const metadata: Metadata = {
  title: "Settings",
  description: "Your public profile on FailProducts.",
  robots: { index: false, follow: false },
};

export default async function DashboardSettingsPage() {
  // The layout has already required a session; this is the account behind it.
  const user = await currentUserOrNull();
  const profile = user ? await getOwnProfile(user.id) : null;

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
            What people see at your profile URL.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <ProfileForm
            action={updateProfileAction}
            values={{
              username: profile?.username ?? "",
              displayName: profile?.displayName ?? "",
              bio: profile?.bio ?? "",
              websiteUrl: profile?.websiteUrl ?? "",
            }}
          />
        </CardContent>
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
