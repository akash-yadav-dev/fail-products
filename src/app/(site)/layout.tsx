// src/app/(site)/layout.tsx
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SkipToContent } from "@/components/layout/skip-to-content";

/**
 * Everything a visitor sees: the marketing pages, the directory, and sign-in.
 *
 * The route group leaves URLs untouched — /products is still /products — while
 * giving these routes a shared header and footer that the dashboard does not
 * inherit.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SkipToContent />
      <SiteHeader />
      <main id="main-content" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
