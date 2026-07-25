import type { MembershipSummary } from "@/lib/auth/access";
import { MASTER } from "@/lib/platform/master-codes";
import { prisma } from "@/lib/prisma";

export type PlatformUserBundle = {
  authUserId: string;
  profile: null | {
    id: string;
    email: string;
    displayName: string;
    statusCode: string;
  };
  platformRoles: string[];
  memberships: MembershipSummary[];
};

export async function loadPlatformUserBundle(
  authUserId: string,
): Promise<PlatformUserBundle> {
  const assignmentActive = await prisma.assignmentStatus.findUnique({
    where: { code: MASTER.assignmentStatus.ACTIVE },
  });
  const membershipActive = await prisma.membershipStatus.findUnique({
    where: { code: MASTER.membershipStatus.ACTIVE },
  });
  const branchActive = await prisma.branchStatus.findUnique({
    where: { code: MASTER.branchStatus.ACTIVE },
  });

  if (!assignmentActive || !membershipActive) {
    return {
      authUserId,
      profile: null,
      platformRoles: [],
      memberships: [],
    };
  }

  const profile = await prisma.userProfile.findUnique({
    where: { authUserId },
    include: {
      status: true,
      platformRoles: {
        where: { statusId: assignmentActive.id },
        include: { role: true },
      },
      memberships: {
        where: { statusId: membershipActive.id },
        include: {
          organization: { include: { status: true } },
          roles: {
            where: { statusId: assignmentActive.id },
            include: { role: true },
          },
          branchScopes: {
            where: { statusId: assignmentActive.id },
            include: {
              scopeType: true,
              branch: { include: { status: true } },
            },
          },
        },
      },
    },
  });

  if (!profile) {
    return {
      authUserId,
      profile: null,
      platformRoles: [],
      memberships: [],
    };
  }

  const memberships: MembershipSummary[] = [];
  for (const m of profile.memberships) {
    const roles = m.roles.map((r) => r.role.code);
    let branches: MembershipSummary["branches"] = [];

    const hasAllBranches = m.branchScopes.some(
      (s) => s.scopeType.code === MASTER.branchScopeType.ALL_BRANCHES,
    );

    if (hasAllBranches && branchActive) {
      const orgBranches = await prisma.branch.findMany({
        where: {
          organizationId: m.organizationId,
          deletedAt: null,
          statusId: branchActive.id,
        },
        orderBy: { code: "asc" },
      });
      branches = orgBranches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
      }));
    } else {
      branches = m.branchScopes
        .filter(
          (s) =>
            s.scopeType.code === MASTER.branchScopeType.SELECTED &&
            s.branch &&
            s.branch.status.code === MASTER.branchStatus.ACTIVE,
        )
        .map((s) => ({
          id: s.branch!.id,
          name: s.branch!.name,
          code: s.branch!.code,
        }));
    }

    memberships.push({
      organizationId: m.organizationId,
      organizationName: m.organization.displayName,
      organizationStatus: m.organization.status.code,
      roles,
      branches,
    });
  }

  return {
    authUserId,
    profile: {
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      statusCode: profile.status.code,
    },
    platformRoles: profile.platformRoles.map((r) => r.role.code),
    memberships,
  };
}
