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
import { invalidateCustomerBootstrapCache } from "@/lib/platform/customer-bootstrap-cache";
import { listActiveManagedOrganizationIds, resolveActiveCustomerAssignmentScope } from "@/lib/platform/customer-portfolio";
import { MASTER } from "@/lib/platform/master-codes";
import { invalidateEffectiveCodesCache } from "@/lib/permissions/effective-codes-cache";
import { permissionsForRoles } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

const switchSchema = z.object({
  organizationId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  /** Explicitly finish the branch-selection step (including 「ทุกสาขา」). */
  branchSelected: z.boolean().optional(),
  mode: z.enum(["membership", "platform_admin", "managed_org"]).optional(),
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
  const managedOrganizationIds = await listActiveManagedOrganizationIds(
    prisma,
    bundle.profile.id,
  );
  const activeMembership = cookie
    ? bundle.memberships.find((m) => m.organizationId === cookie.organizationId)
    : null;

  let platformAdminOrganization: {
    id: string;
    name: string;
    customerCode: string;
  } | null = null;
  if (cookie && !activeMembership) {
    const isManagedOrgClaim =
      cookie.mode === "managed_org" &&
      managedOrganizationIds.includes(cookie.organizationId);
    if (!(isSuper && cookie.mode === "platform_admin") && !isManagedOrgClaim) {
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
      select: { id: true, displayName: true, customerCode: true },
    });
    if (!org) {
      return NextResponse.json(
        { code: "ORG_FORBIDDEN", message: TH.access.forbidden },
        { status: 403 },
      );
    }
    platformAdminOrganization = {
      id: org.id,
      name: org.displayName,
      customerCode: org.customerCode,
    };
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
        select: { id: true, displayName: true, customerCode: true },
        orderBy: { displayName: "asc" },
        take: 200,
      })
    : [];

  const managedOrganizations =
    managedOrganizationIds.length > 0
      ? await prisma.organization.findMany({
          where: {
            id: { in: managedOrganizationIds },
            deletedAt: null,
            status: { code: MASTER.organizationStatus.ACTIVE },
          },
          select: { id: true, displayName: true, customerCode: true },
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
      customerCode: m.customerCode ?? null,
      roles: m.roles,
      branchCount: m.branches.length,
    })),
    platformAdminOrganizations: adminOrganizations.map((o) => ({
      id: o.id,
      name: o.displayName,
      customerCode: o.customerCode,
    })),
    managedOrganizations: managedOrganizations.map((o) => ({
      id: o.id,
      name: o.displayName,
      customerCode: o.customerCode,
    })),
    contextMode: cookie?.mode ?? "membership",
    activeOrganization: activeMembership
      ? {
          id: activeMembership.organizationId,
          name: activeMembership.organizationName,
          customerCode: activeMembership.customerCode ?? null,
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

  const { organizationId, branchId = null, employeeId = null } = parsed.data;
  const previous = decodeContextCookie(
    request.cookies.get(COOKIE_NAME)?.value,
  );
  let branchSelected = false;
  if (parsed.data.branchSelected === true || branchId != null) {
    branchSelected = true;
  } else if (parsed.data.branchSelected === false) {
    branchSelected = false;
  } else if (
    previous?.organizationId === organizationId &&
    previous.branchSelected === true
  ) {
    branchSelected = true;
  }
  const isSuper = bundle.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
  const requestedPlatformAdmin = parsed.data.mode === "platform_admin";
  if (requestedPlatformAdmin && !isSuper) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: TH.access.forbidden },
      { status: 403 },
    );
  }
  const membership = bundle.memberships.find(
    (m) => m.organizationId === organizationId,
  );
  const memberAccess = canAccessOrganization(bundle.memberships, organizationId);
  const platformAdminAccess =
    isSuper &&
    (requestedPlatformAdmin || !memberAccess) &&
    canAccessOrganization(bundle.memberships, organizationId, {
      platformRoles: bundle.platformRoles,
      allowPlatformAdmin: true,
    });

  const managedOrganizationIds = !memberAccess
    ? await listActiveManagedOrganizationIds(prisma, bundle.profile.id)
    : [];
  const managedOrgAccess =
    !memberAccess &&
    !platformAdminAccess &&
    managedOrganizationIds.includes(organizationId);
  const managedScope = managedOrgAccess
    ? await resolveActiveCustomerAssignmentScope(prisma, bundle.profile.id, organizationId)
    : null;

  if (!memberAccess && !platformAdminAccess && !managedOrgAccess) {
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
  let contextBranches: Array<{ id: string; name: string; code: string }> = membership?.branches ?? [];

  if (platformAdminAccess || managedOrgAccess) {
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
          where: {
            deletedAt: null,
            status: { code: MASTER.branchStatus.ACTIVE },
            ...(managedScope && !managedScope.allBranches
              ? { id: { in: managedScope.branchIds } }
              : {}),
          },
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
    contextBranches = org.branches;
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

  const mode = platformAdminAccess
    ? "platform_admin"
    : managedOrgAccess
      ? "managed_org"
      : "membership";
  const encoded = encodeContextCookie({
    organizationId,
    branchId,
    employeeId,
    branchSelected,
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

  const availableBranches = contextBranches;

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
    availableBranches,
    needsBranchSelection:
      !branchSelected &&
      availableBranches.length > 1 &&
      mode === "membership",
    statusHint: MASTER.organizationStatus.ACTIVE,
  });

  response.cookies.set(COOKIE_NAME, encoded, contextCookieOptions());
  invalidateCustomerBootstrapCache(user.id);
  invalidateEffectiveCodesCache(user.id);
  return response;
}
