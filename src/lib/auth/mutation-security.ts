import type { NextRequest } from "next/server";

/**
 * CSRF guard for cookie-authenticated mutations.
 * Prefer Origin === request origin; when Origin is omitted (common on some
 * same-origin POSTs / LAN IP hosts), fall back to Sec-Fetch-Site / Referer.
 */
export function isSameOriginMutation(request: NextRequest): boolean {
  const requestOrigin = request.nextUrl.origin;

  const originHeader = request.headers.get("origin");
  if (originHeader) {
    try {
      return new URL(originHeader).origin === requestOrigin;
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") {
    return true;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === requestOrigin;
    } catch {
      return false;
    }
  }

  return false;
}

export function getIdempotencyKey(request: NextRequest): string | null {
  const value = request.headers.get("idempotency-key")?.trim();
  return value || null;
}
