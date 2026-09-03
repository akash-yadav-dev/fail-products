import type { NextConfig } from "next";

/**
 * Response headers.
 *
 * The site renders user-submitted comments and has an authenticated moderation
 * dashboard, and until now carried no headers at all — so the entire defence
 * against a rendering mistake was the rendering layer itself. That layer is
 * sound (comments are typed nodes, never an HTML string, and nothing passes
 * user content to `dangerouslySetInnerHTML`), but one layer is not defence in
 * depth.
 *
 * Deliberately not a Content-Security-Policy yet. A CSP has to name the hosts a
 * deployment actually uses, and there is no deployment — no hosting target is
 * chosen and no Cloudflare project exists (`docs/DEPLOYMENT.md` §8). A CSP
 * written against an unknown origin could not be verified here, would almost
 * certainly break Turnstile's iframe on first contact, and would join the list
 * of things this project claims but has never observed. It belongs in the same
 * change as the first deploy, where it can be watched in report-only mode
 * first.
 *
 * These four need no such knowledge. They are true of the application wherever
 * it runs.
 */
const securityHeaders = [
  {
    // Clickjacking. The moderation dashboard performs destructive actions on a
    // click, which is exactly what a framing attack is for. `frame-ancestors`
    // is the CSP directive that supersedes X-Frame-Options; both are sent
    // because the older header is still what some intermediaries honour.
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  {
    // Stops a browser guessing a content type. Relevant because user-supplied
    // text reaches responses, and a sniffed type is how text becomes script.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // A listing links out to the product's own site. Without this the full URL
    // of the page a visitor came from — including a moderation path — is sent
    // to that third party. Origin-only, and only over https.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
