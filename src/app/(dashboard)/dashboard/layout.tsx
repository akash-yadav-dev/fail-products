// src/app/(dashboard)/dashboard/layout.tsx
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { Container } from "@/components/shared/container";

/**
 * Creator dashboard shell.
 *
 * There is no authentication yet, so this is a public layout preview. When
 * auth lands, this layout is where the session check belongs.
 */
export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  return (
    <>
      <section className="border-b border-border/60 bg-muted/30">
        <Container className="flex flex-col gap-6 py-8 sm:py-10">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground text-pretty">
              Your listings, your waitlists, and what FailProducts sent to your
              product.
            </p>
          </div>
          <DashboardNav />
        </Container>
      </section>

      <Container className="flex flex-col gap-8 py-10 sm:py-14">
        <Alert>
          <AlertTitle>Not signed in, and not gated yet</AlertTitle>
          <AlertDescription>
            Authentication is not implemented, so this section is open and
            renders placeholders instead of your data.
          </AlertDescription>
        </Alert>
        {children}
      </Container>
    </>
  );
}
