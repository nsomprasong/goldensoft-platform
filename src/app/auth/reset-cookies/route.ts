import { NextResponse, type NextRequest } from "next/server";

import { clearSsoCookies } from "@/lib/auth/expire-host-cookies";
import { resolvePostLoginRedirect } from "@/lib/auth/post-login-redirect";
import { COOKIE_NAME } from "@/lib/context/cookie";

export const dynamic = "force-dynamic";

/** Browser-facing origin (container listens on 0.0.0.0 — never use that). */
function publicOrigin(request: NextRequest): string {
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.split(",")[0]?.trim();
  const forwardedProto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    "https";
  if (
    forwardedHost &&
    !forwardedHost.startsWith("0.0.0.0") &&
    !forwardedHost.startsWith("127.0.0.1")
  ) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return request.nextUrl.origin;
}

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
  const login = new URL("/login", publicOrigin(request));
  if (next && next !== "/") {
    login.searchParams.set("next", next);
  }
  login.searchParams.set("sso_cleared", "1");

  const res = NextResponse.redirect(login, 303);
  clearSsoCookies(res, [...names]);
  return res;
}
