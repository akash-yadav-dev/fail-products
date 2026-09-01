// src/db/index.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "@/db/schema";
import { databaseUrl } from "@/lib/config/database";

/**
 * The database client.
 *
 * **HTTP, not a pool.** Neon's own documentation is explicit that in serverless
 * environments such as Cloudflare Workers a WebSocket connection cannot outlive
 * a single request, so `Pool` and `Client` must be opened, used, and closed
 * inside one handler. `neon()` issues each query as an HTTP request instead,
 * which is the right shape for every query this application makes — checked
 * against https://neon.com/docs/serverless/serverless-driver on 2026-08-31.
 *
 * A `pg` pool would not work here at all: Workers has no TCP socket.
 *
 * Access goes component/page → service → repository → here
 * (docs/ENGINEERING.md §14). Nothing imports this module directly from a
 * component.
 */

/**
 * Created per call rather than at module scope.
 *
 * A Workers isolate is shared across requests and recycled unpredictably, so a
 * module-level client would capture whichever environment happened to be
 * present when the isolate booted. `neon()` holds no connection, so there is
 * nothing to pool and nothing to reuse.
 */
export function getDb() {
  return drizzle(neon(databaseUrl()), { schema });
}

export type Database = ReturnType<typeof getDb>;

export { schema };
