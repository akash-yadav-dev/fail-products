// src/app/api/products/[id]/waitlist/route.ts
import { CSV_BOM } from "@/lib/csv/escape";
import { currentUser } from "@/services/auth/current-user";
import { exportWaitlistCsv } from "@/services/waitlist/server-waitlist";
import { WaitlistError } from "@/services/waitlist/waitlist-service";

/**
 * A product's waitlist, as CSV (Phase 4 slice 4.2).
 *
 * The path `docs/CODE-STRUCTURE.md` already names for this resource. A route
 * handler rather than a Server Action, because the response is a file: an
 * action returns a value to React, and there is no way to make that a download.
 *
 * **Never cached, at any layer.** The response is a list of third parties'
 * email addresses; a shared cache holding one is the single worst outcome this
 * endpoint has. `force-dynamic` keeps Next from trying to prerender it, and
 * `no-store` covers everything downstream.
 *
 * **Streamed.** The service yields rows a page at a time, and this hands the
 * generator straight to a `ReadableStream` — so the response starts before the
 * whole list has been read and no request ever holds the entire table in
 * memory. That matters on a metered CPU budget (`docs/ENGINEERING.md` §7), and
 * it is the difference between an export that works at fifty thousand
 * subscribers and one that times out.
 *
 * Authorization happens **before** the stream is constructed, which is why the
 * service splits the check from the generator: an async generator's body does
 * not run until something pulls from it, so a check inside one would have meant
 * returning 200 and discovering the refusal halfway through the body.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/products/[id]/waitlist">
) {
  const { id } = await params;

  // From the session cookie, never from the request (`AGENTS.md` §7). The
  // service re-loads the product and compares its owner against this.
  const user = await currentUser();

  let exported;
  try {
    exported = await exportWaitlistCsv({
      viewer: { userId: user?.id ?? null },
      productId: id,
    });
  } catch (error) {
    return errorResponse(error);
  }

  const rows = exported.rows();
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // First bytes out. Without it Excel on Windows reads the file in the
      // system codepage, so a subscriber with a non-ASCII address opens as
      // mojibake — and this file's whole purpose is those addresses.
      controller.enqueue(encoder.encode(CSV_BOM));
    },
    async pull(controller) {
      try {
        const next = await rows.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(next.value));
      } catch {
        // A database failure mid-stream. The headers are already sent, so
        // there is no status code left to change — erroring the stream is the
        // only way to tell the client the file is incomplete rather than
        // handing them a truncated list they would take as the whole thing.
        controller.error(new Error("waitlist export failed"));
      }
    },
    async cancel() {
      // The download was abandoned. Release the generator so its pending page
      // read does not keep running for a response nobody is reading.
      await rows.return(undefined);
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filenameFor(exported.productSlug)}"`,
      // Bulk personal data. Not by a browser, not by a CDN, not by anything.
      "cache-control": "no-store, private",
      // The filename is derived from a slug, but the body is user-supplied
      // text; nothing downstream may guess at a type for it.
      "x-content-type-options": "nosniff",
    },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof WaitlistError && error.code === "RATE_LIMITED") {
    return new Response("Too many exports. Try again shortly.\n", {
      status: 429,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Everything else is 404, including an authorization failure. A 403 on a
  // product somebody does not own confirms that the product exists
  // (`docs/SECURITY.md` §3).
  return new Response("Not found\n", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * A safe filename.
 *
 * The slug is already constrained by `domain/product/slug.ts`, but this string
 * lands in a `Content-Disposition` header, and a header value is exactly where
 * an unexpected quote or newline stops being cosmetic. Narrowed to the
 * characters a filename needs and nothing else.
 */
function filenameFor(slug: string): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, "").slice(0, 64) || "waitlist";
  return `${safe}-waitlist.csv`;
}
