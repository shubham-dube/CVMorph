import { NextRequest, NextResponse } from "next/server";

/**
 * Route guard. Checks for the mirrored (non-httpOnly) session cookie set
 * by the client after login — see docs/FRONTEND_BACKEND_GAPS.md §1 for
 * why this isn't a real httpOnly session and what should replace it.
 */
const PUBLIC_PATHS = ["/login"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname === "/") {
    return NextResponse.next();
  }

  const hasSession = req.cookies.get("cvmorph_session")?.value === "1";
  if (!hasSession) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
