// src/components/layout/site-footer.tsx
import type * as React from "react";
import Link from "next/link";

import { Separator } from "@/components/ui/separator";
import { SiteLogo } from "@/components/layout/site-logo";
import { Container } from "@/components/shared/container";
import { footerNav, siteConfig } from "@/lib/config/site";

/** Lucide ships no brand marks, so the two glyphs used here are inlined. */
function XIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GitHubIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.1.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.96 0-1.32.47-2.39 1.24-3.23-.13-.3-.54-1.53.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.23 0 4.63-2.8 5.65-5.48 5.95.43.37.82 1.1.82 2.22v3.29c0 .32.21.69.82.57A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

const EXTERNAL_LINK_CLASS =
  "inline-flex min-h-9 items-center gap-2 rounded-lg text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-muted/20">
      <Container className="py-12 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] lg:gap-8">
          <div className="flex flex-col items-start gap-4">
            <Link
              href="/"
              aria-label={`${siteConfig.name} home`}
              className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <SiteLogo size="sm" />
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground text-pretty">
              {siteConfig.description}
            </p>
            <div className="flex flex-col items-start gap-1">
              <a
                href={siteConfig.social.x.url}
                target="_blank"
                rel="me noopener noreferrer"
                aria-label={`${siteConfig.name} on ${siteConfig.social.x.label}`}
                className={EXTERNAL_LINK_CLASS}
              >
                <XIcon className="size-4" />
                <span>{siteConfig.social.x.handle}</span>
              </a>
              <a
                href={siteConfig.repository}
                target="_blank"
                rel="noopener noreferrer"
                className={EXTERNAL_LINK_CLASS}
              >
                <GitHubIcon className="size-4" />
                <span>Source on GitHub</span>
              </a>
            </div>
          </div>

          {footerNav.map((group) => (
            <nav key={group.title} aria-label={group.title} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                {group.title}
              </h2>
              <ul className="flex flex-col gap-1">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-9 items-center rounded-lg text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {siteConfig.name} &middot;{" "}
            {siteConfig.license}
          </p>
          <p>{siteConfig.tagline}</p>
        </div>
      </Container>
    </footer>
  );
}
