// src/components/layout/site-logo.tsx
import Image from "next/image";

import { siteConfig } from "@/lib/config/site";
import { cn } from "@/lib/utils";

/**
 * The lockup used by the header, the mobile sheet, the footer, and the home
 * hero. One component so the mark never drifts between them.
 *
 * The source file is square, so a single request width covers every size at
 * 2x; the rendered box is controlled with classes.
 */
const MARK_SIZES = {
  sm: "size-8",
  md: "size-9 sm:size-10",
  lg: "size-16 sm:size-20",
} as const;

const WORDMARK_SIZES = {
  sm: "text-sm",
  md: "text-base sm:text-lg",
  lg: "text-2xl sm:text-3xl",
} as const;

export function SiteLogo({
  size = "md",
  withWordmark = true,
  priority = false,
  className,
}: {
  size?: keyof typeof MARK_SIZES;
  withWordmark?: boolean;
  priority?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Image
        src="/brand/logo.png"
        // The wordmark already names the site; a second copy would be noise.
        alt={withWordmark ? "" : siteConfig.name}
        width={160}
        height={160}
        priority={priority}
        sizes="80px"
        className={cn("rounded-lg object-contain", MARK_SIZES[size])}
      />
      {withWordmark ? (
        <span
          className={cn(
            "font-semibold tracking-tight text-foreground",
            WORDMARK_SIZES[size]
          )}
        >
          {siteConfig.name}
        </span>
      ) : null}
    </span>
  );
}
