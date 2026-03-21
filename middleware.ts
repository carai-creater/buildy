import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Serve the English static landing (public/index.html) at "/" without a redirect.
 * Ensures the default homepage is always the English marketplace hero, not another route.
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/index.html";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
