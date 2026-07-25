import { NextRequest, NextResponse } from "next/server";

import {
  canAccessBranch,
  canAccessOrganization,
} from "@/lib/auth/access";
import { getAuthUser } from "@/lib/auth/session";
import { loadPlatformUserBundle } from "@/lib/auth/platform-user";
import {
  COOKIE_NAME,
  contextCookieOptions,
  encodeContextCookie,
} from "@/lib/context/cookie";

function appOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return request.nextUrl.origin;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto =
    forwardedProto ??
    (request.nextUrl.protocol.replace(":", "") || "http");
  return `${proto}://${host}`;
}

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/api/")) return "/";
  return raw;
}

/** Server-side auto context selection (no client-trusted IDs without membership check). */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  const origin = appOrigin(request);
  if (!user) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const organizationId = request.nextUrl.searchParams.get("organizationId");
  const branchIdRaw = request.nextUrl.searchParams.get("branchId");
  const branchId =
    branchIdRaw && branchIdRaw.length > 0 ? branchIdRaw : null;
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (!organizationId) {
    return NextResponse.redirect(new URL("/select-organization", origin));
  }

  const bundle = await loadPlatformUserBundle(user.id);
  if (
    !canAccessOrganization(bundle.memberships, organizationId) ||
    !canAccessBranch(bundle.memberships, organizationId, branchId)
  ) {
    return NextResponse.redirect(
      new URL("/access?reason=no_membership", origin),
    );
  }

  // 303 avoids some browsers replaying/caching redirect chains after POST login.
  const response = NextResponse.redirect(new URL(next, origin), 303);
  response.cookies.set(
    COOKIE_NAME,
    encodeContextCookie({ organizationId, branchId }),
    contextCookieOptions(),
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
