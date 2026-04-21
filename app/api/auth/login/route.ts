import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, checkPassword, makeToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  if (!checkPassword(password)) {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "1");
    if (next && next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }
  const res = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", req.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, await makeToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
