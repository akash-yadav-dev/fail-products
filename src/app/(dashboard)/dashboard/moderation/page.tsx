// src/app/(dashboard)/dashboard/moderation/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ModerationQueue } from "@/components/dashboard/moderation-queue";
import { currentUserOrNull } from "@/services/auth/current-user";
import {
  listModerationLog,
  listReports,
} from "@/services/moderation/server-moderation";
import { isModerator } from "@/services/user/server-profile";
import {
  hideCommentAction,
  moderateProductAction,
  resolveReportAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Report queue",
  // Never indexed, and never followed. It is behind a session and a role, so a
  // crawler would only ever see the 404 — but saying so costs nothing and keeps
  // the route out of a sitemap somebody generates later.
  robots: { index: false, follow: false },
};

/**
 * The moderation queue (Phase 3 slice 3.4).
 *
 * **404, not 403, for anybody without the role.** A 403 confirms the route
 * exists and that the account is close to having access; a 404 says nothing.
 * The check here is what hides the page; it is not what protects the actions —
 * each of those re-checks the role in the service, against the database,
 * because a Server Action is a public endpoint whether or not a page rendered
 * a button for it.
 */
export default async function ModerationPage() {
  const user = await currentUserOrNull();
  // Two checks, not one belt-and-braces check. This one decides what the
  // visitor sees; the services re-check the role before they act, because a
  // Server Action is reachable without this page ever having rendered.
  if (!user || !(await isModerator(user.id))) notFound();

  const [queue, log] = await Promise.all([
    listReports({ viewer: { userId: user.id } }),
    listModerationLog({ viewer: { userId: user.id } }),
  ]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Report queue
          </h1>
          <Badge variant={queue.openCount > 0 ? "destructive" : "secondary"}>
            {queue.openCount} open
          </Badge>
        </div>
        <p className="max-w-prose text-sm text-muted-foreground text-pretty">
          Every action here is recorded with your account and the reason you
          give. Nothing is removed automatically, and a decision taken in
          error can be undone — that is what makes the record worth keeping.
        </p>
      </div>

      <ModerationQueue
        entries={queue.items}
        moderateCommentAction={hideCommentAction}
        moderateProductAction={moderateProductAction}
        resolveReportAction={resolveReportAction}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent actions</CardTitle>
          <CardDescription>
            Comment moderation, newest first. A product&rsquo;s moderation
            sits on its own timeline with the owner&rsquo;s changes (ADR-013),
            not here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3 text-sm">
              {log.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-1 border-b border-border/60 pb-3 last:border-0 last:pb-0"
                >
                  <span className="text-muted-foreground">
                    {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    {" · "}
                    {entry.actorUsername
                      ? `@${entry.actorUsername}`
                      : "a deleted account"}
                    {" moved a comment from "}
                    <strong className="font-medium text-foreground">
                      {entry.fromValue}
                    </strong>
                    {" to "}
                    <strong className="font-medium text-foreground">
                      {entry.toValue}
                    </strong>
                  </span>
                  <span className="text-pretty">{entry.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
