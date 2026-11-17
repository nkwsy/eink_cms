import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/favicon.ico"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public device endpoints: /:slug/current.bmp, /:slug/current.png and the
  // device settings file /:slug/dv_signage.xml
  if (/^\/[^/]+\/(current\.(bmp|png)|dv_signage\.xml)$/.test(pathname)) {
    return NextResponse.next();
  }
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/_next/") || pathname.startsWith("/static/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifyToken(token)) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  if (isApi) {
    return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
