import { NextRequest, NextResponse } from "next/server";

import { COOKIE_NAME, contextCookieOptions } from "@/lib/context/cookie";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/api/")) return "/";
  return raw;
}

/**
 * Clears the platform org-context cookie then redirects. Must run in a Route
 * Handler — Server Components cannot modify cookies.
 */
export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.set(COOKIE_NAME, "", contextCookieOptions(0));
  return response;
}
