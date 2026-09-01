// src/app/global-error.tsx
"use client";

/**
 * The boundary of last resort: it replaces the root layout, so it cannot use
 * any of the app's providers, fonts, or components, and it has to render its
 * own <html> and <body>.
 *
 * Same rule as src/app/error.tsx — `digest` only, never `message` or `stack`.
 * Styles are inline because the boundary must still render when the stylesheet
 * is the thing that failed.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
            Something went wrong on our side
          </h1>
          <p style={{ marginTop: "0.75rem", color: "#a1a1a1", lineHeight: 1.6 }}>
            The page could not be rendered. Reloading usually fixes it.
          </p>
          {error.digest ? (
            <p
              style={{
                marginTop: "1rem",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                fontSize: "0.75rem",
                color: "#a1a1a1",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <p style={{ marginTop: "1.5rem" }}>
            {/*
              A plain anchor on purpose. Client-side routing would re-render the
              same broken tree; a full document load gives the server another
              chance at the root layout, which is what failed to get here.
            */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ color: "#fafafa" }}>
              Back to home
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
