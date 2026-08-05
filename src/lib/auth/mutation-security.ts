import type { NextRequest } from "next/server";

/**
 * CSRF guard for cookie-authenticated mutations.
 * Prefer Origin === request origin; when Origin is omitted (common on some
 * same-origin POSTs / LAN IP hosts), fall back to Sec-Fetch-Site / Referer.
 */
export function isSameOriginMutation(request: NextRequest): boolean {
  const requestOrigins = new Set([request.nextUrl.origin]);
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : request.nextUrl.protocol.replace(":", "");
  if (host && !/[\s/\\]/.test(host)) {
    requestOrigins.add(`${protocol}://${host}`);
  }

  const originHeader = request.headers.get("origin");
  if (originHeader) {
    try {
      return requestOrigins.has(new URL(originHeader).origin);
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
      return requestOrigins.has(new URL(referer).origin);
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
