import { NextResponse, type NextRequest } from "next/server";

/** Gives every visitor an anonymous session so their protection is theirs alone. */
export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  if (!request.cookies.get("wm_session")) {
    const id = crypto.randomUUID();
    request.cookies.set("wm_session", id);
    const forwarded = NextResponse.next({ request: { headers: request.headers } });
    forwarded.cookies.set("wm_session", id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 });
    return forwarded;
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon|icon).*)"] };
