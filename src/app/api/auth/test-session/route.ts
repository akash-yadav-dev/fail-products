import { NextResponse } from "next/server";
import { e2eAuthBypassEnabled } from "@/lib/config/auth";

const TEST_COOKIE = "failproducts_e2e_session";

export function GET(request: Request) {
  // This route is unreachable unless the Playwright-only environment variable
  // is explicitly injected; it is not part of .env.example or deployment docs.
  if (!e2eAuthBypassEnabled()) {
    return new NextResponse(null, { status: 404 });
  }
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.cookies.set(TEST_COOKIE, "1", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
  });
  return response;
}

export { TEST_COOKIE };
