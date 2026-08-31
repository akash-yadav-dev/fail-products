// src/app/(dashboard)/dashboard/settings/page.tsx
import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const metadata: Metadata = {
  title: "Settings",
  description: "Your public profile on FailProducts.",
  robots: { index: false, follow: false },
};

export default function DashboardSettingsPage() {
  return (
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
    </Card>
  );
}
