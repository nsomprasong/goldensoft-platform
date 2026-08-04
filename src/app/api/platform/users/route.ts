import { NextRequest, NextResponse } from "next/server";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import {
  COOKIE_NAME,
  decodeContextCookie,
} from "@/lib/context/cookie";
import { TH } from "@/lib/i18n/th";
import {
  invitationVisibleInBranch,
  parseBranchIdsJson,
} from "@/lib/platform/branch-data-scope";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: TH.common.sessionExpired }, { status: 401 });
  }
  const actor = await loadActorAccess(prisma, user.id);
  const permissions = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles,
  });
  if (!permissions.includes(PLATFORM_PERMISSIONS.userRead)) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }
  const canReadAll =
    actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) ||
    actor.platformRoles.includes(MASTER.platformRole.SUPPORT);
  const visibleOrganizationIds = [
    ...new Set([
      ...actor.membershipOrganizationIds,
      ...actor.managedOrganizationIds,
    ]),
  ];
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (
    organizationId &&
    !canReadAll &&
    !visibleOrganizationIds.includes(organizationId)
  ) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }

  const cookie = decodeContextCookie(request.cookies.get(COOKIE_NAME)?.value);
  const activeBranchId =
    cookie &&
    (!organizationId || cookie.organizationId === organizationId)
      ? cookie.branchId
      : null;

  const invitations = await prisma.userInvitation.findMany({
    where: {
      organizationId: organizationId
        ? organizationId
        : canReadAll
          ? undefined
          : { in: visibleOrganizationIds },
    },
    select: {
      id: true,
      emailNormalized: true,
      displayName: true,
      createdAt: true,
      authInviteSentAt: true,
      attemptCount: true,
      branchIdsJson: true,
      organization: { select: { id: true, displayName: true } },
      organizationRole: { select: { code: true } },
      branchScopeType: { select: { code: true } },
      status: { select: { code: true } },
      invitedByProfile: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const scoped = activeBranchId
    ? invitations.filter((row) =>
        invitationVisibleInBranch(
          {
            scopeTypeCode: row.branchScopeType.code,
            branchIds: parseBranchIdsJson(row.branchIdsJson),
          },
          activeBranchId,
        ),
      )
    : invitations;

  return NextResponse.json({
    invitations: scoped,
    activeBranchId,
  });
}
