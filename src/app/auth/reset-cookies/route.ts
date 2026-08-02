import { NextResponse, type NextRequest } from "next/server";

import { clearSsoCookies } from "@/lib/auth/expire-host-cookies";
import { resolvePostLoginRedirect } from "@/lib/auth/post-login-redirect";
import { COOKIE_NAME } from "@/lib/context/cookie";

export const dynamic = "force-dynamic";

/**
 * Clear host-only + Domain=.goldensoft.cloud Auth cookies, then return to login.
 * Used when Customer App cannot read the Platform session (sso_retry).
 */
export async function GET(request: NextRequest) {
  const names = new Set<string>([COOKIE_NAME]);
  for (const c of request.cookies.getAll()) {
    names.add(c.name);
  }

  const next = resolvePostLoginRedirect(
    request.nextUrl.searchParams.get("next"),
  );
  const login = new URL("/login", request.nextUrl.origin);
  if (next && next !== "/") {
    login.searchParams.set("next", next);
  }
  login.searchParams.set("sso_cleared", "1");

  const res = NextResponse.redirect(login, 303);
  clearSsoCookies(res, [...names]);
  return res;
}
