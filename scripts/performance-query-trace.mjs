// Local production-server measurement only; never imported by application code.
// Usage: PERF_QUERY_TRACE=/absolute/path/counts.jsonl node --import
// ./scripts/performance-query-trace.mjs node_modules/next/dist/bin/next start
// Run performance-regressions.spec.ts with the same PERF_QUERY_TRACE and workers=1.
// Logs classifications only: no SQL text, bindings, URLs, tokens, or account IDs.
import { appendFileSync } from "node:fs";
const tracePath = process.env.PERF_QUERY_TRACE;
if (tracePath) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function (url, init) {
    let kind;
    try {
      const query = JSON.parse(init?.body ?? "{}").query ?? "";
      if (query.startsWith("select") && query.includes('"products"."slug" =')) kind = "product-detail";
      else if (query.startsWith("select") && query.includes('"username_lower" =')) kind = "profile";
      else if (query.startsWith("select") && query.includes('from "sessions"')) kind = "session";
    } catch { /* Non-database request body. */ }
    if (kind) appendFileSync(tracePath, JSON.stringify({ kind }) + "\n");
    return originalFetch(url, init);
  };
}
