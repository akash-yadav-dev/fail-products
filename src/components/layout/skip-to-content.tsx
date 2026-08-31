// src/components/layout/skip-to-content.tsx
/**
 * The first focusable control on a page, so a keyboard user can jump past the
 * navigation. Every layout that renders a <main id="main-content"> renders this
 * immediately before its chrome.
 */
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-3 focus:ring-ring/50"
    >
      Skip to content
    </a>
  );
}
