import * as React from "react"

/** Tailwind's `md`. Below it, the sidebar and the site nav both switch to a sheet. */
const MOBILE_BREAKPOINT = 768

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)

  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/**
 * Rewritten from the shadcn/ui generator's version, which set state inside an
 * effect to seed the first value — the pattern `react-hooks/set-state-in-effect`
 * rejects, and a double render on every mount.
 *
 * useSyncExternalStore reads the media query during render on the client and
 * returns the server snapshot during SSR, so the markup is stable and the value
 * is correct on the first client paint.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    // No viewport exists on the server. Desktop-first matches the CSS, where
    // the mobile sheet is the `md:hidden` case.
    () => false
  )
}
