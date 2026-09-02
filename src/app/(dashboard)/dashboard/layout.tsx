// src/app/(dashboard)/dashboard/layout.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { SkipToContent } from "@/components/layout/skip-to-content";
import { SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { getSessionUser } from "@/services/auth/server-auth";
import { isModerator } from "@/services/user/server-profile";
import { e2eAuthBypassEnabled } from "@/lib/config/auth";
import { signOutAction } from "@/app/(site)/auth/actions";

const TEST_COOKIE = "failproducts_e2e_session";

/**
 * Creator dashboard shell.
 *
 * A separate surface from the public site: its own sidebar, its own header, and
 * none of the marketing chrome, which is why it lives outside app/(site).
 *
 * The inset renders as a plain wrapper rather than its default <main> so the
 * header stays a banner landmark and the skip link lands past it, on the page
 * content itself.
 *
 * Authentication is checked here so every dashboard route passes through the
 * same server-side session gate.
 */
export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const cookieStore = await cookies();
  const testBypass =
    e2eAuthBypassEnabled() && cookieStore.get(TEST_COOKIE)?.value === "1";

  let moderator = false;
  if (!testBypass) {
    const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
    const session = await getSessionUser(sessionToken ?? "");
    if (!session) redirect("/auth/sign-in");

    // Decides whether the moderation link is rendered, and nothing more. The
    // route 404s and every action re-checks the role, so a wrong answer here
    // is a missing link rather than an authorization hole.
    moderator = await isModerator(session.userId);
  }

  return (
    <SidebarProvider>
      <SkipToContent />
      <DashboardSidebar signOutAction={signOutAction} isModerator={moderator} />

      <SidebarInset asChild>
        <div>
          <DashboardHeader />

          <main
            id="main-content"
            className="flex flex-1 flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-8"
          >
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
