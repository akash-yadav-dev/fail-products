// src/app/go/[slug]/route.ts
import { notFound, redirect } from "next/navigation";

import {
  buildOutboundProductUrl,
  OUTBOUND_CAMPAIGNS,
} from "@/lib/urls/outbound";
import { recordOutboundClick } from "@/services/referral/server-referral";
import { ReferralError } from "@/services/referral/referral-service";

/**
 * The outbound hop (ADR-018, slice 4.3).
 *
 * Every link from this site to a product's own website goes through here, so
 * that the one number `docs/PRODUCT.md` §5 lets a founder be shown — outbound
 * clicks FailProducts sent — is counted where it happens rather than guessed
 * at. A client-side beacon would have counted only visitors who ran our
 * JavaScript and did not leave before it fired, which is a number that looks
 * like traffic and is not.
 *
 * **Not an open redirect.** The destination is never read from the request. The
 * slug is resolved through the public-visibility predicate and the URL comes
 * from that row, so the only place this can send anybody is a website a founder
 * published on their own listing — and a hidden, draft, or removed listing does
 * not resolve at all, which stops the route being used to reach content the
 * directory is refusing to show.
 *
 * **Never cached, at any layer.** A cached redirect is a click that was never
 * counted and a destination frozen at whatever it was when the cache filled.
 * `force-dynamic` keeps Next from prerendering it and `no-store` covers
 * everything downstream.
 *
 * Temporary, never permanent. A 301 is exactly the thing a browser is entitled
 * to remember and stop asking about, which would silently end the counting this
 * route exists for. `redirect()` issues a temporary status; the E2E asserts the
 * property rather than a particular code, because which one the framework picks
 * is its business and not a thing to hard-code from memory.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/go/[slug]">
) {
  const { slug } = await params;

  let resolved;
  try {
    resolved = await recordOutboundClick(slug);
  } catch (error) {
    if (error instanceof ReferralError) notFound();
    throw error;
  }

  const destination = buildOutboundProductUrl(
    resolved.websiteUrl,
    OUTBOUND_CAMPAIGNS.productPage
  );

  // A listing with no website, or one whose stored URL no longer passes the
  // scheme allowlist. There is nowhere safe to send the visitor, and inventing
  // a fallback would be the open redirect this route is careful not to be.
  if (!destination) notFound();

  redirect(destination);
}
