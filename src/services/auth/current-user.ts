// src/services/auth/current-user.ts
import { cookies } from "next/headers";

import { SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { getSessionUser } from "@/services/auth/server-auth";

/**
 * The signed-in account for the current request, or null.
 *
 * Read from the session cookie server-side, never from a form field or a
 * client-supplied id (`AGENTS.md` §7). Every authorization decision in the
 * product service takes its viewer from here.
 */
export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await getSessionUser(token);
  if (!session) return null;

  return { id: session.userId, email: session.email };
}

/**
 * The signed-in account, or null, without throwing when the database is
 * unreachable.
 *
 * The dashboard layout has already established that a session exists by the
 * time a page renders. A page that additionally cannot reach the database
 * should render its error state rather than take the whole route down, which
 * is what an uncaught throw in a Server Component does.
 */
export async function currentUserOrNull() {
  try {
    return await currentUser();
  } catch {
    return null;
  }
}
