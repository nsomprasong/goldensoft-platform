import type { PrismaClient } from "@prisma/client";
import { cache } from "react";

import { measure } from "@/lib/perf/server-timing";
import { MASTER } from "@/lib/platform/master-codes";
import type { ActorAccess } from "@/lib/platform/organizations-admin";

export type ResolvedActorAccess = ActorAccess & {
  organizationRoles: string[];
  organizationRolesByOrganization: Record<string, string[]>;
  profileId: string | null;
};

function emptyAccess(authUserId: string): ResolvedActorAccess {
  return {
    authUserId,
    platformRoles: [],
    membershipOrganizationIds: [],
    organizationRoles: [],
    organizationRolesByOrganization: {},
    profileId: null,
  };
}

/**
 * Request-scoped via React cache(): pages, guards and helpers that need actor
 * permissions in one request share a single resolution. Cached per
 * (client, authUserId), so no state is shared across requests or tenants.
 */
export const loadActorAccess = cache(async function loadActorAccess(
  db: PrismaClient,
  authUserId: string,
): Promise<ResolvedActorAccess> {
  const [assignmentActive, membershipActive] = await Promise.all([
    db.assignmentStatus.findUnique({
      where: { code: MASTER.assignmentStatus.ACTIVE },
      select: { id: true },
    }),
    db.membershipStatus.findUnique({
      where: { code: MASTER.membershipStatus.ACTIVE },
      select: { id: true },
    }),
  ]);
  if (!assignmentActive || !membershipActive) {
    return emptyAccess(authUserId);
  }

  const profile = await measure("permissions", () =>
    db.userProfile.findUnique({
      where: { authUserId },
      select: {
        id: true,
        platformRoles: {
          where: { statusId: assignmentActive.id, revokedAt: null },
          select: { role: { select: { code: true } } },
        },
        memberships: {
          where: { statusId: membershipActive.id },
          select: {
            organizationId: true,
            roles: {
              where: { statusId: assignmentActive.id, revokedAt: null },
              select: { role: { select: { code: true } } },
            },
          },
        },
      },
    }),
  );

  if (!profile) {
    return emptyAccess(authUserId);
  }

  return {
    authUserId,
    profileId: profile.id,
    platformRoles: profile.platformRoles.map((r) => r.role.code),
    membershipOrganizationIds: profile.memberships.map((m) => m.organizationId),
    organizationRoles: profile.memberships.flatMap((m) =>
      m.roles.map((r) => r.role.code),
    ),
    organizationRolesByOrganization: Object.fromEntries(
      profile.memberships.map((membership) => [
        membership.organizationId,
        membership.roles.map((role) => role.role.code),
      ]),
    ),
  };
});
