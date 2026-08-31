// src/app/(dashboard)/dashboard/layout.tsx
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { SkipToContent } from "@/components/layout/skip-to-content";

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
 * There is no authentication yet, so this is a public layout preview. When auth
 * lands, the session check belongs here — it is the single point every
 * dashboard route passes through.
 */
export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  return (
    <SidebarProvider>
      <SkipToContent />
      <DashboardSidebar />

      <SidebarInset asChild>
        <div>
          <DashboardHeader />

          <main
            id="main-content"
            className="flex flex-1 flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-8"
          >
            <Alert>
              <AlertTitle>Not signed in, and not gated yet</AlertTitle>
              <AlertDescription>
                Authentication is not implemented, so this section is open to
                anyone and shows placeholders instead of your data.
              </AlertDescription>
            </Alert>

            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
