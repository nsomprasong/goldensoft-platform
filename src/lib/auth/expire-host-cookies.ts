import type { NextResponse } from "next/server";

import { authCookieDomain } from "@/lib/auth/cookie-domain";

/**
 * After AUTH_COOKIE_DOMAIN, browsers often keep BOTH host-only and Domain=
 * cookies with the same name. Both are sent → Cookie header bloat → HTTP 431.
 */
export function expireHostOnlyCookie(
  response: NextResponse,
  name: string,
  path = "/",
): void {
  if (!authCookieDomain()) return;
  response.cookies.set(name, "", {
    path,
    maxAge: 0,
    expires: new Date(0),
  });
}

export function clearSsoCookies(response: NextResponse, names: string[]): void {
  const domain = authCookieDomain();
  const base = {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
  for (const name of names) {
    response.cookies.set(name, "", base);
    if (domain) {
      response.cookies.set(name, "", { ...base, domain });
    }
  }
}
