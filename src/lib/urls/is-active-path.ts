// src/lib/urls/is-active-path.ts
/**
 * Whether `href` is the current section, used for nav highlighting.
 *
 * "/" only matches exactly; every other href also matches its descendants, so
 * /products/some-slug still highlights "Products".
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
