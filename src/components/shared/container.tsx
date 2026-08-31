// src/components/shared/container.tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Horizontal page gutter and max width.
 *
 * Widths follow docs/DESIGN.md #5: ~1200px for page content, ~800px for
 * reading content. Every page, the header, and the footer use this so the
 * left edge of content lines up all the way down the page.
 */
const containerVariants = cva("mx-auto w-full px-4 sm:px-6 lg:px-8", {
  variants: {
    width: {
      default: "max-w-[1200px]",
      prose: "max-w-[800px]",
    },
  },
  defaultVariants: {
    width: "default",
  },
});

function Container({
  className,
  width,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof containerVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="container"
      className={cn(containerVariants({ width, className }))}
      {...props}
    />
  );
}

export { Container, containerVariants };
