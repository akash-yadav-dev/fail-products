// src/app/fault/page.tsx
import { notFound } from "next/navigation";

/**
 * Fault injection, for one test: proving that a server render failure reaches
 * the visitor as a safe message and never as a stack trace
 * (docs/ENGINEERING.md §11). That guarantee cannot be asserted without an
 * error to assert against.
 *
 * The route does not exist unless E2E_FAULT_ROUTES is "1" in the environment
 * the server runs in — playwright.config.ts sets it for the E2E build and
 * nothing else does, so every other environment 404s here. It is rendered per
 * request so a build never evaluates the throw.
 */
export const dynamic = "force-dynamic";

/** Unique, greppable, and deliberately unlike anything in the UI copy. */
export const FAULT_SENTINEL = "FAULT_SENTINEL_9f2c1a";

export default function FaultPage() {
  if (process.env.E2E_FAULT_ROUTES !== "1") {
    notFound();
  }

  throw new Error(
    `${FAULT_SENTINEL}: deliberate failure raised by tests/e2e/error-boundary.spec.ts`
  );
}
