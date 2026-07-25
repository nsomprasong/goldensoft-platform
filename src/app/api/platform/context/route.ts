import { NextRequest, NextResponse } from "next/server";
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
import { MASTER } from "@/lib/platform/master-codes";
import { permissionsForRoles } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

const switchSchema = z.object({
  organizationId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
});

async function ensureAuditAction(code: string, nameTh: string, nameEn: string) {
  return prisma.auditActionType.upsert({
    where: { code },
    create: {
      code,
      nameTh,
      nameEn,
      sortOrder: 100,
      isActive: true,
      isSystem: true,
    },
    update: {},
  });
}

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
  const activeMembership = cookie
    ? bundle.memberships.find((m) => m.organizationId === cookie.organizationId)
    : null;

  if (cookie && !activeMembership) {
    return NextResponse.json(
      {
        code: "ORG_FORBIDDEN",
        message: TH.access.forbidden,
      },
      { status: 403 },
    );
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
    activeOrganization: activeMembership
      ? {
          id: activeMembership.organizationId,
          name: activeMembership.organizationName,
        }
      : null,
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

  if (!canAccessOrganization(bundle.memberships, organizationId)) {
    return NextResponse.json(
      { code: "ORG_FORBIDDEN", message: TH.access.forbidden },
      { status: 403 },
    );
  }

  if (!canAccessBranch(bundle.memberships, organizationId, branchId)) {
    return NextResponse.json(
      { code: "BRANCH_FORBIDDEN", message: TH.access.forbidden },
      { status: 403 },
    );
  }

  const previous = decodeContextCookie(
    request.cookies.get(COOKIE_NAME)?.value,
  );

  const encoded = encodeContextCookie({
    organizationId,
    branchId,
  });

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

  const action = await ensureAuditAction(
    "context.switch",
    "เปลี่ยนบริบทองค์กรหรือสาขา",
    "Switch organization or branch context",
  );

  await prisma.auditLog.create({
    data: {
      organizationId,
      actorAuthUserId: user.id,
      actionTypeId: action.id,
      entityType: "platform_context",
      entityId: organizationId,
      beforeJson: previous
        ? {
            organizationId: previous.organizationId,
            branchId: previous.branchId,
          }
        : undefined,
      afterJson: { organizationId, branchId },
      userAgent: request.headers.get("user-agent"),
    },
  });

  const membership = bundle.memberships.find(
    (m) => m.organizationId === organizationId,
  )!;
  const branch =
    branchId === null
      ? null
      : (membership.branches.find((b) => b.id === branchId) ?? null);

  const response = NextResponse.json({
    ok: true,
    message: TH.common.saved,
    activeOrganization: {
      id: membership.organizationId,
      name: membership.organizationName,
    },
    activeBranch: branch
      ? { id: branch.id, name: branch.name, code: branch.code }
      : null,
    statusHint: MASTER.organizationStatus.ACTIVE,
  });

  response.cookies.set(COOKIE_NAME, encoded, contextCookieOptions());
  return response;
}
