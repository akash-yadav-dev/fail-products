"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

export function ProductSearch({ initialQuery, category, status }: {
  initialQuery: string;
  category?: string;
  status?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const urlQuery = useSearchParams().get("q") ?? "";
  const [value, setValue] = useState(initialQuery);
  // `requested` is the query this box last asked the URL to hold; `seenQuery`
  // is the URL query it last reconciled against. Together they tell our own
  // debounced navigation landing apart from a query that arrived from somewhere
  // else — a link, back/forward, a filter — and only the second may replace
  // what is in the box. Adopting every URL change instead would delete the
  // characters typed while the previous navigation was still in flight, and
  // then never search for them, because the box would match the URL again.
  const [requested, setRequested] = useState(initialQuery);
  const [seenQuery, setSeenQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  // Reconciled during render, not in an effect: an effect would first let the
  // stale value render and could replay it as a navigation. Unlike a
  // query-keyed remount, this keeps the focused input element.
  if (seenQuery !== urlQuery) {
    setSeenQuery(urlQuery);
    if (urlQuery !== requested) {
      setRequested(urlQuery);
      setValue(urlQuery);
    }
  }

  useEffect(() => {
    const next = value.trim();
    if (next === urlQuery.trim()) return;

    // `ENGINEERING.md` §7: debounce the input. Undebounced, every keystroke is
    // a server render and a database query, and "postmortem" alone is eleven of
    // them on a metered connection.
    const timer = setTimeout(() => {
      setRequested(next);

      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (status) params.set("status", status);
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
  }, [value, urlQuery, category, status, pathname, router]);

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
      {category ? <input type="hidden" name="category" value={category} /> : null}
      {status ? <input type="hidden" name="status" value={status} /> : null}
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
