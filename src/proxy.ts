import { NextResponse, type NextRequest } from "next/server";

const PREVIEW_PAGES = new Set([
  "/", "/about", "/demo", "/guidelines", "/privacy", "/terms", "/takedown",
]);

export function proxy(request: NextRequest) {
  if (process.env.PREVIEW_ONLY !== "1") return NextResponse.next();

  const path = request.nextUrl.pathname.replace(/\/$/, "") || "/";
  if (path === "/robots.txt") return NextResponse.next();

  if (!PREVIEW_PAGES.has(path) && path !== "/api/health") {
    return new NextResponse("This route is unavailable in the staging preview.", {
      status: 404,
      headers: { "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
