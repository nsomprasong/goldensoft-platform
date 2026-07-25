import { cache } from "react";

import type { MembershipSummary } from "@/lib/auth/access";
import { measure } from "@/lib/perf/server-timing";
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

/**
 * Load auth context without selecting Phase 5 columns that exist in Prisma
 * schema / client but are not applied in DB until migration 0002 is approved.
 */
export const loadPlatformUserBundle = cache(async function loadPlatformUserBundle(
  authUserId: string,
): Promise<PlatformUserBundle> {
  const [assignmentActive, membershipActive, branchActive] = await measure(
    "context",
    () =>
      Promise.all([
        prisma.assignmentStatus.findUnique({
          where: { code: MASTER.assignmentStatus.ACTIVE },
          select: { id: true },
        }),
        prisma.membershipStatus.findUnique({
          where: { code: MASTER.membershipStatus.ACTIVE },
          select: { id: true },
        }),
        prisma.branchStatus.findUnique({
          where: { code: MASTER.branchStatus.ACTIVE },
          select: { id: true },
        }),
      ]),
  );

  if (!assignmentActive || !membershipActive) {
    return {
      authUserId,
      profile: null,
      platformRoles: [],
      memberships: [],
    };
  }

  const profile = await measure("profile", () =>
    prisma.userProfile.findUnique({
    where: { authUserId },
    select: {
      id: true,
      email: true,
      displayName: true,
      status: { select: { code: true } },
      platformRoles: {
        where: { statusId: assignmentActive.id },
        select: { role: { select: { code: true } } },
      },
      memberships: {
        where: { statusId: membershipActive.id },
        select: {
          organizationId: true,
          organization: {
            select: {
              displayName: true,
              status: { select: { code: true } },
            },
          },
          roles: {
            where: { statusId: assignmentActive.id },
            select: { role: { select: { code: true } } },
          },
          branchScopes: {
            where: { statusId: assignmentActive.id },
            select: {
              scopeType: { select: { code: true } },
              branch: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  status: { select: { code: true } },
                },
              },
            },
          },
        },
      },
    },
    }),
  );

  if (!profile) {
    return {
      authUserId,
      profile: null,
      platformRoles: [],
      memberships: [],
    };
  }

  const allBranchOrganizationIds = profile.memberships
    .filter((m) =>
      m.branchScopes.some(
        (s) => s.scopeType.code === MASTER.branchScopeType.ALL_BRANCHES,
      ),
    )
    .map((m) => m.organizationId);

  // Single query for every ALL_BRANCHES membership instead of one per membership.
  const branchesByOrganization = new Map<
    string,
    MembershipSummary["branches"]
  >();
  if (allBranchOrganizationIds.length > 0 && branchActive) {
    const orgBranches = await measure("memberships", () =>
      prisma.branch.findMany({
        where: {
          organizationId: { in: allBranchOrganizationIds },
          deletedAt: null,
          statusId: branchActive.id,
        },
        select: { id: true, name: true, code: true, organizationId: true },
        orderBy: { code: "asc" },
      }),
    );
    for (const branch of orgBranches) {
      const list = branchesByOrganization.get(branch.organizationId) ?? [];
      list.push({ id: branch.id, name: branch.name, code: branch.code });
      branchesByOrganization.set(branch.organizationId, list);
    }
  }

  const memberships: MembershipSummary[] = profile.memberships.map((m) => {
    const hasAllBranches = m.branchScopes.some(
      (s) => s.scopeType.code === MASTER.branchScopeType.ALL_BRANCHES,
    );

    const branches: MembershipSummary["branches"] =
      hasAllBranches && branchActive
        ? (branchesByOrganization.get(m.organizationId) ?? [])
        : m.branchScopes
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

    return {
      organizationId: m.organizationId,
      organizationName: m.organization.displayName,
      organizationStatus: m.organization.status.code,
      roles: m.roles.map((r) => r.role.code),
      branches,
    };
  });

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
});
