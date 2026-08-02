import type { NextResponse } from "next/server";

import { authCookieDomain } from "@/lib/auth/cookie-domain";

/**
 * NextResponse.cookies.set() collapses by cookie name, so a host-only clear
 * followed by Domain=… write would drop the clear. Append raw Set-Cookie
 * headers when we need both.
 */
function appendSetCookie(response: NextResponse, value: string): void {
  response.headers.append("Set-Cookie", value);
}

function expiredSetCookie(
  name: string,
  opts: {
    path?: string;
    domain?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
  } = {},
): string {
  const parts = [
    `${name}=`,
    `Path=${opts.path ?? "/"}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) {
    const ss =
      opts.sameSite === "lax"
        ? "Lax"
        : opts.sameSite === "strict"
          ? "Strict"
          : "None";
    parts.push(`SameSite=${ss}`);
  }
  return parts.join("; ");
}

/**
 * After AUTH_COOKIE_DOMAIN, browsers often keep BOTH host-only and Domain=
 * cookies with the same name. Both are sent → Cookie header bloat → HTTP 431.
 * Call AFTER writing the Domain cookie so this clear is not collapsed away.
 */
export function expireHostOnlyCookie(
  response: NextResponse,
  name: string,
  path = "/",
): void {
  if (!authCookieDomain()) return;
  appendSetCookie(
    response,
    expiredSetCookie(name, {
      path,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    }),
  );
}

/** Clear common SSO cookies (host-only + shared Domain). */
export function clearSsoCookies(response: NextResponse, names: string[]): void {
  const domain = authCookieDomain();
  const secure = process.env.NODE_ENV === "production";
  for (const name of names) {
    appendSetCookie(
      response,
      expiredSetCookie(name, {
        httpOnly: true,
        secure,
        sameSite: "lax",
      }),
    );
    if (domain) {
      appendSetCookie(
        response,
        expiredSetCookie(name, {
          domain,
          httpOnly: true,
          secure,
          sameSite: "lax",
        }),
      );
    }
  }
}
