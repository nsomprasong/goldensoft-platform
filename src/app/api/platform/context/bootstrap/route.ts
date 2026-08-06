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
import { isGoldenSoftPlatformStaff } from "@/lib/auth/customer-app-redirect";
import { GOLDENSOFT_CUSTOMER_CODE } from "@/lib/platform/organization-identity";
import { MASTER } from "@/lib/platform/master-codes";
import {
  listActiveManagedOrganizationIds,
  resolveActiveCustomerAssignmentScope,
} from "@/lib/platform/customer-portfolio";
import { prisma } from "@/lib/prisma";

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
  let branchId =
    branchIdRaw && branchIdRaw.length > 0 ? branchIdRaw : null;
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const requestedMode = request.nextUrl.searchParams.get("mode");

  if (!organizationId) {
    return NextResponse.redirect(new URL("/select-organization", origin));
  }

  const bundle = await loadPlatformUserBundle(user.id);
  const isSuperAdmin = bundle.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
  if (
    requestedMode === "platform_admin" &&
    (isSuperAdmin || isGoldenSoftPlatformStaff(bundle.platformRoles))
  ) {
    const organization = await prisma.organization.findFirst({
      where: {
        id: organizationId,
        ...(!isSuperAdmin ? { customerCode: GOLDENSOFT_CUSTOMER_CODE } : {}),
        deletedAt: null,
        status: { code: "ACTIVE" },
      },
      select: {
        branches: {
          where: { deletedAt: null, status: { code: "ACTIVE" } },
          select: { id: true },
          take: 2,
        },
      },
    });
    if (!organization) {
      return NextResponse.redirect(new URL("/access?reason=no_membership", origin));
    }
    if (!branchId && organization.branches.length === 1) {
      branchId = organization.branches[0]!.id;
    }
    const response = NextResponse.redirect(new URL(next, origin), 303);
    response.cookies.set(
      COOKIE_NAME,
      encodeContextCookie({
        organizationId,
        branchId,
        branchSelected: branchId != null,
        mode: "platform_admin",
      }),
      contextCookieOptions(),
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  if (requestedMode === "managed_org" && bundle.profile) {
    const managedIds = await listActiveManagedOrganizationIds(prisma, bundle.profile.id);
    if (managedIds.includes(organizationId)) {
      const scope = await resolveActiveCustomerAssignmentScope(prisma, bundle.profile.id, organizationId);
      const organization = await prisma.organization.findFirst({
        where: { id: organizationId, deletedAt: null, status: { code: MASTER.organizationStatus.ACTIVE } },
        select: {
          branches: {
            where: {
              deletedAt: null,
              status: { code: MASTER.branchStatus.ACTIVE },
              ...(scope && !scope.allBranches ? { id: { in: scope.branchIds } } : {}),
            },
            select: { id: true },
            take: 200,
          },
        },
      });
      if (!organization || (branchId && !organization.branches.some((branch) => branch.id === branchId))) {
        return NextResponse.redirect(new URL("/access?reason=no_membership", origin));
      }
      if (!branchId && organization.branches.length === 1) branchId = organization.branches[0]!.id;
      const response = NextResponse.redirect(new URL(next, origin), 303);
      response.cookies.set(
        COOKIE_NAME,
        encodeContextCookie({ organizationId, branchId, branchSelected: branchId != null, mode: "managed_org" }),
        contextCookieOptions(),
      );
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
  }
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
    encodeContextCookie({
      organizationId,
      branchId,
      branchSelected: branchId != null,
    }),
    contextCookieOptions(),
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
