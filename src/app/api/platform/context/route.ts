import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  canAccessBranch,
  canAccessOrganization,
} from "@/lib/auth/access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { loadPlatformUserBundle } from "@/lib/auth/platform-user";
import {
  COOKIE_NAME,
  contextCookieOptions,
  decodeContextCookie,
  encodeContextCookie,
} from "@/lib/context/cookie";
import { TH } from "@/lib/i18n/th";
import { writeAuditLog } from "@/lib/platform/audit";
import { MASTER } from "@/lib/platform/master-codes";
import { permissionsForRoles } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

const switchSchema = z.object({
  organizationId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
    );
  }

  const bundle = await loadPlatformUserBundle(user.id);
  if (!bundle.profile) {
    return NextResponse.json(
      { code: "PROFILE_NOT_FOUND", message: TH.access.noProfileTitle },
      { status: 403 },
    );
  }
  if (bundle.profile.statusCode !== "ACTIVE") {
    return NextResponse.json(
      { code: "PROFILE_SUSPENDED", message: TH.access.suspendedTitle },
      { status: 403 },
    );
  }

  const cookie = decodeContextCookie(request.cookies.get(COOKIE_NAME)?.value);
  const isSuper = bundle.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
  const activeMembership = cookie
    ? bundle.memberships.find((m) => m.organizationId === cookie.organizationId)
    : null;

  let platformAdminOrganization: { id: string; name: string } | null = null;
  if (cookie && !activeMembership) {
    if (!(isSuper && cookie.mode === "platform_admin")) {
      return NextResponse.json(
        {
          code: "ORG_FORBIDDEN",
          message: TH.access.forbidden,
        },
        { status: 403 },
      );
    }
    const org = await prisma.organization.findFirst({
      where: {
        id: cookie.organizationId,
        deletedAt: null,
        status: { code: MASTER.organizationStatus.ACTIVE },
      },
      select: { id: true, displayName: true },
    });
    if (!org) {
      return NextResponse.json(
        { code: "ORG_FORBIDDEN", message: TH.access.forbidden },
        { status: 403 },
      );
    }
    platformAdminOrganization = { id: org.id, name: org.displayName };
  }

  const activeBranch =
    activeMembership && cookie?.branchId
      ? (activeMembership.branches.find((b) => b.id === cookie.branchId) ??
        null)
      : null;

  if (cookie?.branchId && activeMembership && !activeBranch) {
    return NextResponse.json(
      { code: "BRANCH_FORBIDDEN", message: TH.access.forbidden },
      { status: 403 },
    );
  }

  const organizationRoles = activeMembership?.roles ?? [];
  const permissions = permissionsForRoles({
    platformRoles: bundle.platformRoles,
    organizationRoles,
  });

  const adminOrganizations = isSuper
    ? await prisma.organization.findMany({
        where: {
          deletedAt: null,
          status: { code: MASTER.organizationStatus.ACTIVE },
        },
        select: { id: true, displayName: true },
        orderBy: { displayName: "asc" },
        take: 200,
      })
    : [];

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile: {
      displayName: bundle.profile.displayName,
      email: bundle.profile.email,
      statusCode: bundle.profile.statusCode,
    },
    platformRoles: bundle.platformRoles,
    memberships: bundle.memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organizationName,
      organizationStatus: m.organizationStatus,
      roles: m.roles,
      branchCount: m.branches.length,
    })),
    platformAdminOrganizations: adminOrganizations.map((o) => ({
      id: o.id,
      name: o.displayName,
    })),
    contextMode: cookie?.mode ?? "membership",
    activeOrganization: activeMembership
      ? {
          id: activeMembership.organizationId,
          name: activeMembership.organizationName,
        }
      : platformAdminOrganization,
    activeBranch: activeBranch
      ? {
          id: activeBranch.id,
          name: activeBranch.name,
          code: activeBranch.code,
        }
      : null,
    permissions,
  });
}

export async function POST(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: TH.common.sessionExpired },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }

  const parsed = switchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_BODY", message: TH.common.failed },
      { status: 400 },
    );
  }

  const bundle = await loadPlatformUserBundle(user.id);
  if (!bundle.profile || bundle.profile.statusCode !== "ACTIVE") {
    return NextResponse.json(
      { code: "PROFILE_NOT_FOUND", message: TH.access.noProfileTitle },
      { status: 403 },
    );
  }

  const { organizationId, branchId = null } = parsed.data;
  const isSuper = bundle.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
  const membership = bundle.memberships.find(
    (m) => m.organizationId === organizationId,
  );
  const memberAccess = canAccessOrganization(bundle.memberships, organizationId);
  const platformAdminAccess =
    !memberAccess &&
    isSuper &&
    canAccessOrganization(bundle.memberships, organizationId, {
      platformRoles: bundle.platformRoles,
      allowPlatformAdmin: true,
    });

  if (!memberAccess && !platformAdminAccess) {
    return NextResponse.json(
      { code: "ORG_FORBIDDEN", message: TH.access.forbidden },
      { status: 403 },
    );
  }

  let activeOrganizationName = membership?.organizationName ?? null;
  let resolvedBranch =
    membership && branchId
      ? (membership.branches.find((b) => b.id === branchId) ?? null)
      : null;

  if (platformAdminAccess) {
    const org = await prisma.organization.findFirst({
      where: {
        id: organizationId,
        deletedAt: null,
        status: { code: MASTER.organizationStatus.ACTIVE },
      },
      select: {
        id: true,
        displayName: true,
        branches: {
          where: { deletedAt: null, status: { code: MASTER.branchStatus.ACTIVE } },
          select: { id: true, name: true, code: true },
          orderBy: { code: "asc" },
          take: 200,
        },
      },
    });
    if (!org) {
      return NextResponse.json(
        { code: "ORG_FORBIDDEN", message: TH.access.forbidden },
        { status: 403 },
      );
    }
    activeOrganizationName = org.displayName;
    if (branchId) {
      resolvedBranch = org.branches.find((b) => b.id === branchId) ?? null;
      if (!resolvedBranch) {
        return NextResponse.json(
          { code: "BRANCH_FORBIDDEN", message: TH.access.forbidden },
          { status: 403 },
        );
      }
    }
  } else if (!canAccessBranch(bundle.memberships, organizationId, branchId)) {
    return NextResponse.json(
      { code: "BRANCH_FORBIDDEN", message: TH.access.forbidden },
      { status: 403 },
    );
  }

  const previous = decodeContextCookie(
    request.cookies.get(COOKIE_NAME)?.value,
  );

  const mode = platformAdminAccess ? "platform_admin" : "membership";
  const encoded = encodeContextCookie({
    organizationId,
    branchId,
    mode,
  });

  // Preference must finish before the response so last-org restore stays correct.
  await prisma.userPreference.upsert({
    where: { userProfileId: bundle.profile.id },
    create: {
      userProfileId: bundle.profile.id,
      lastOrganizationId: organizationId,
      lastBranchId: branchId,
    },
    update: {
      lastOrganizationId: organizationId,
      lastBranchId: branchId,
    },
  });

  const auditPayload = {
    organizationId,
    actorAuthUserId: user.id,
    actionCode: platformAdminAccess
      ? MASTER.auditActionType.CONTEXT_PLATFORM_ADMIN
      : MASTER.auditActionType.CONTEXT_SWITCH,
    entityType: "platform_context",
    entityId: organizationId,
    before: previous
      ? {
          organizationId: previous.organizationId,
          branchId: previous.branchId,
          mode: previous.mode ?? "membership",
        }
      : undefined,
    after: { organizationId, branchId, mode },
    userAgent: request.headers.get("user-agent"),
  };

  // Audit is durable but not on the user-visible critical path.
  after(() => {
    void writeAuditLog(prisma, auditPayload);
  });

  const response = NextResponse.json({
    ok: true,
    message: TH.common.saved,
    contextMode: mode,
    activeOrganization: {
      id: organizationId,
      name: activeOrganizationName,
    },
    activeBranch: resolvedBranch
      ? {
          id: resolvedBranch.id,
          name: resolvedBranch.name,
          code: resolvedBranch.code,
        }
      : null,
    statusHint: MASTER.organizationStatus.ACTIVE,
  });

  response.cookies.set(COOKIE_NAME, encoded, contextCookieOptions());
  return response;
}
