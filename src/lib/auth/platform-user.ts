import { cache } from "react";

import type { MembershipSummary } from "@/lib/auth/access";
import {
  readPlatformUserBundleCache,
  writePlatformUserBundleCache,
} from "@/lib/auth/platform-user-cache";
import { measure } from "@/lib/perf/server-timing";
import { MASTER } from "@/lib/platform/master-codes";
import { getActiveStatusIds } from "@/lib/platform/master-ids";
import { prisma } from "@/lib/prisma";

export type PlatformUserBundle = {
  authUserId: string;
  profile: null | {
    id: string;
    email: string;
    phone: string | null;
    displayName: string;
    statusCode: string;
  };
  platformRoles: string[];
  memberships: MembershipSummary[];
};

async function loadPlatformUserBundleUncached(
  authUserId: string,
): Promise<PlatformUserBundle> {
  const statusIds = await measure("context", () => getActiveStatusIds(prisma));

  if (!statusIds) {
    return {
      authUserId,
      profile: null,
      platformRoles: [],
      memberships: [],
    };
  }

  const { assignmentActiveId, membershipActiveId, branchActiveId } = statusIds;

  // Flat parallel queries beat one deep nested Prisma select over remote RTT.
  const [profile, platformRoleRows, membershipRows, membershipRoleRows, scopeRows] =
    await measure("profile", () =>
      Promise.all([
        prisma.userProfile.findUnique({
          where: { authUserId },
          select: {
            id: true,
            email: true,
            phone: true,
            displayName: true,
            status: { select: { code: true } },
          },
        }),
        prisma.platformRoleAssignment.findMany({
          where: {
            statusId: assignmentActiveId,
            revokedAt: null,
            userProfile: { authUserId },
          },
          select: { role: { select: { code: true } } },
        }),
        prisma.organizationMembership.findMany({
          where: {
            statusId: membershipActiveId,
            userProfile: { authUserId },
          },
          select: {
            id: true,
            organizationId: true,
            organization: {
              select: {
                displayName: true,
                customerCode: true,
                status: { select: { code: true } },
              },
            },
          },
        }),
        prisma.organizationMembershipRole.findMany({
          where: {
            statusId: assignmentActiveId,
            revokedAt: null,
            membership: {
              statusId: membershipActiveId,
              userProfile: { authUserId },
            },
          },
          select: {
            membershipId: true,
            role: { select: { code: true } },
          },
        }),
        prisma.organizationMembershipBranchScope.findMany({
          where: {
            statusId: assignmentActiveId,
            membership: {
              statusId: membershipActiveId,
              userProfile: { authUserId },
            },
          },
          select: {
            membershipId: true,
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
        }),
      ]),
    );

  if (!profile) {
    return {
      authUserId,
      profile: null,
      platformRoles: [],
      memberships: [],
    };
  }

  const rolesByMembership = new Map<string, string[]>();
  for (const row of membershipRoleRows) {
    const list = rolesByMembership.get(row.membershipId) ?? [];
    list.push(row.role.code);
    rolesByMembership.set(row.membershipId, list);
  }

  const scopesByMembership = new Map<string, typeof scopeRows>();
  for (const row of scopeRows) {
    const list = scopesByMembership.get(row.membershipId) ?? [];
    list.push(row);
    scopesByMembership.set(row.membershipId, list);
  }

  const allBranchOrganizationIds = membershipRows
    .filter((m) =>
      (scopesByMembership.get(m.id) ?? []).some(
        (s) => s.scopeType.code === MASTER.branchScopeType.ALL_BRANCHES,
      ),
    )
    .map((m) => m.organizationId);

  const branchesByOrganization = new Map<
    string,
    MembershipSummary["branches"]
  >();
  if (allBranchOrganizationIds.length > 0 && branchActiveId) {
    const orgBranches = await measure("memberships", () =>
      prisma.branch.findMany({
        where: {
          organizationId: { in: allBranchOrganizationIds },
          deletedAt: null,
          statusId: branchActiveId,
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

  const memberships: MembershipSummary[] = membershipRows.map((m) => {
    const scopes = scopesByMembership.get(m.id) ?? [];
    const hasAllBranches = scopes.some(
      (s) => s.scopeType.code === MASTER.branchScopeType.ALL_BRANCHES,
    );

    const branches: MembershipSummary["branches"] =
      hasAllBranches && branchActiveId
        ? (branchesByOrganization.get(m.organizationId) ?? [])
        : scopes
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
      customerCode: m.organization.customerCode,
      roles: rolesByMembership.get(m.id) ?? [],
      branches,
    };
  });

  return {
    authUserId,
    profile: {
      id: profile.id,
      email: profile.email,
      phone: profile.phone ?? null,
      displayName: profile.displayName,
      statusCode: profile.status.code,
    },
    platformRoles: platformRoleRows.map((r) => r.role.code),
    memberships,
  };
}

/**
 * Load auth context without selecting Phase 5 columns that exist in Prisma
 * schema / client but are not applied in DB until migration 0002 is approved.
 */
export const loadPlatformUserBundle = cache(async function loadPlatformUserBundle(
  authUserId: string,
): Promise<PlatformUserBundle> {
  const cached = readPlatformUserBundleCache(authUserId);
  if (cached) return cached as PlatformUserBundle;

  const bundle = await loadPlatformUserBundleUncached(authUserId);
  writePlatformUserBundleCache(authUserId, bundle);
  return bundle;
});
