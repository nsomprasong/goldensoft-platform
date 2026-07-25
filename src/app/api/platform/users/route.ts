import { NextRequest, NextResponse } from "next/server";

import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { TH } from "@/lib/i18n/th";
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
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (
    organizationId &&
    !canReadAll &&
    !actor.membershipOrganizationIds.includes(organizationId)
  ) {
    return NextResponse.json({ message: TH.common.forbidden }, { status: 403 });
  }
  const invitations = await prisma.userInvitation.findMany({
    where: {
      organizationId: organizationId
        ? organizationId
        : canReadAll
          ? undefined
          : { in: actor.membershipOrganizationIds },
    },
    select: {
      id: true,
      emailNormalized: true,
      displayName: true,
      createdAt: true,
      authInviteSentAt: true,
      attemptCount: true,
      organization: { select: { id: true, displayName: true } },
      organizationRole: { select: { code: true } },
      branchScopeType: { select: { code: true } },
      status: { select: { code: true } },
      invitedByProfile: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ invitations });
}
