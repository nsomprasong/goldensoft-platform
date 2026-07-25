import type { PrismaClient } from "@prisma/client";

import { MASTER } from "@/lib/platform/master-codes";
import type { ActorAccess } from "@/lib/platform/organizations-admin";

export async function loadActorAccess(
  db: PrismaClient,
  authUserId: string,
): Promise<ActorAccess & { organizationRoles: string[]; profileId: string | null }> {
  const assignmentActive = await db.assignmentStatus.findUnique({
    where: { code: MASTER.assignmentStatus.ACTIVE },
  });
  const membershipActive = await db.membershipStatus.findUnique({
    where: { code: MASTER.membershipStatus.ACTIVE },
  });
  if (!assignmentActive || !membershipActive) {
    return {
      authUserId,
      platformRoles: [],
      membershipOrganizationIds: [],
      organizationRoles: [],
      profileId: null,
    };
  }

  const profile = await db.userProfile.findUnique({
    where: { authUserId },
    include: {
      platformRoles: {
        where: { statusId: assignmentActive.id, revokedAt: null },
        include: { role: true },
      },
      memberships: {
        where: { statusId: membershipActive.id },
        include: {
          roles: {
            where: { statusId: assignmentActive.id, revokedAt: null },
            include: { role: true },
          },
        },
      },
    },
  });

  if (!profile) {
    return {
      authUserId,
      platformRoles: [],
      membershipOrganizationIds: [],
      organizationRoles: [],
      profileId: null,
    };
  }

  return {
    authUserId,
    profileId: profile.id,
    platformRoles: profile.platformRoles.map((r) => r.role.code),
    membershipOrganizationIds: profile.memberships.map((m) => m.organizationId),
    organizationRoles: profile.memberships.flatMap((m) =>
      m.roles.map((r) => r.role.code),
    ),
  };
}
