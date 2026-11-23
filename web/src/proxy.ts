import { NextResponse, type NextRequest } from "next/server";

import { getAuth } from "@/lib/auth/server";

export function proxy(request: NextRequest) {
  const isSetupRoute = request.nextUrl.pathname === "/configurar-neon";
  const hasAuthConfiguration =
    Boolean(process.env.NEON_AUTH_BASE_URL) &&
    Boolean(process.env.NEON_AUTH_COOKIE_SECRET);

  if (!hasAuthConfiguration) {
    if (isSetupRoute) return NextResponse.next();
    return NextResponse.redirect(new URL("/configurar-neon", request.url));
  }

  return getAuth().middleware({ loginUrl: "/auth/sign-in" })(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
