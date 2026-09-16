import { NextResponse, type NextRequest } from "next/server";

// Session cookie name — kept in sync with src/lib/session.ts. Middleware runs on
// the Edge runtime, so it only checks for the cookie's presence; the actual
// session is validated against Postgres in requireProfile() on each page.
const SESSION_COOKIE = "lv_session";
const PUBLIC_PATHS = ["/login", "/auth"];

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (hasSession && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
