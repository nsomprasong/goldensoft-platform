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

/** Server-side auto context selection (no client-trusted IDs without membership check). */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const organizationId = request.nextUrl.searchParams.get("organizationId");
  const branchIdRaw = request.nextUrl.searchParams.get("branchId");
  const branchId =
    branchIdRaw && branchIdRaw.length > 0 ? branchIdRaw : null;
  const next = request.nextUrl.searchParams.get("next") || "/";

  if (!organizationId) {
    return NextResponse.redirect(new URL("/select-organization", request.url));
  }

  const bundle = await loadPlatformUserBundle(user.id);
  if (
    !canAccessOrganization(bundle.memberships, organizationId) ||
    !canAccessBranch(bundle.memberships, organizationId, branchId)
  ) {
    return NextResponse.redirect(
      new URL("/access?reason=no_membership", request.url),
    );
  }

  const response = NextResponse.redirect(
    new URL(next.startsWith("/") ? next : "/", request.url),
  );
  response.cookies.set(
    COOKIE_NAME,
    encodeContextCookie({ organizationId, branchId }),
    contextCookieOptions(),
  );
  return response;
}
