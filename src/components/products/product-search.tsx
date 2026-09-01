"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { MAX_SEARCH_LENGTH } from "@/domain/product/search";

/**
 * The search box on `/products`.
 *
 * The only client component on a public list page. `ENGINEERING.md` §7 asks
 * public pages to avoid hydration that buys nothing — this buys something: the
 * alternative is a submit button, and a directory search that needs a click per
 * query is a directory search nobody uses.
 *
 * It is still a **form**, so it works with JavaScript disabled: pressing Enter
 * submits a GET to the same page, which is exactly what the debounced path does
 * more smoothly. `PRODUCT.md` §9 requires meaningful content without JavaScript
 * dependence, and the results themselves are rendered on the server either way.
 */
const DEBOUNCE_MS = 300;

export function ProductSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  // What the URL currently reflects. Without it, the effect below fires a
  // navigation on mount and on every re-render that restores the same value.
  const applied = useRef(initialQuery);

  useEffect(() => {
    const next = value.trim();
    if (next === applied.current) return;

    // `ENGINEERING.md` §7: debounce the input. Undebounced, every keystroke is
    // a server render and a database query, and "postmortem" alone is eleven of
    // them on a metered connection.
    const timer = setTimeout(() => {
      applied.current = next;

      const params = new URLSearchParams();
      if (next) params.set("q", next);
      // The cursor and the sort are deliberately dropped. A position in the
      // previous result set means nothing in this one.

      const query = params.toString();
      startTransition(() => {
        // `replace`, not `push`: typing a nine-character query should not put
        // nine entries in the history for the back button to walk through.
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, pathname, router]);

  return (
    <form
      role="search"
      action={pathname}
      method="get"
      className="relative max-w-md"
      onSubmit={(event) => {
        // The debounce has already navigated, or is about to. Letting the form
        // submit as well would produce a second, redundant navigation.
        event.preventDefault();
      }}
    >
      <label htmlFor="product-search" className="sr-only">
        Search products
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id="product-search"
        name="q"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={MAX_SEARCH_LENGTH}
        placeholder="Search products"
        autoComplete="off"
        className="h-11 pl-9"
        // Announced, not just spun: a visitor using a screen reader gets no
        // signal from a subtle opacity change.
        aria-busy={isPending}
      />
    </form>
  );
}
