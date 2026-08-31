// src/components/shared/page-header.tsx
import * as React from "react";
import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Container } from "@/components/shared/container";
import { cn } from "@/lib/utils";

export type Crumb = {
  label: string;
  /** Omit on the last crumb — it renders as the current page. */
  href?: string;
};

/**
 * The banner every interior page starts with: optional breadcrumb, the single
 * <h1> for the page, a short description, and optional actions.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  breadcrumbs?: readonly Crumb[];
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-border/60 bg-muted/30", className)}>
      <Container className="py-10 sm:py-14">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <Breadcrumb className="mb-5">
            <BreadcrumbList>
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;

                return (
                  <React.Fragment key={`${crumb.label}-${index}`}>
                    <BreadcrumbItem>
                      {crumb.href && !isLast ? (
                        <BreadcrumbLink asChild>
                          <Link href={crumb.href}>{crumb.label}</Link>
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                    {!isLast ? <BreadcrumbSeparator /> : null}
                  </React.Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        ) : null}

        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            {eyebrow ? (
              <div className="flex flex-wrap items-center gap-2">{eyebrow}</div>
            ) : null}
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="max-w-2xl text-base text-muted-foreground text-pretty">
                {description}
              </p>
            ) : null}
          </div>

          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              {actions}
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
