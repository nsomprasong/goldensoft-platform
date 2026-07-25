import type { NextRequest } from "next/server";

export function isSameOriginMutation(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export function getIdempotencyKey(request: NextRequest): string | null {
  const value = request.headers.get("idempotency-key")?.trim();
  return value || null;
}
