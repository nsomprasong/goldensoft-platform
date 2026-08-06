import type { Prisma } from "@prisma/client";

import { MASTER } from "@/lib/platform/master-codes";

export function organizationRoleMembershipWhere(input: {
  organizationId: string;
  activeBranchId?: string | null;
}): Prisma.OrganizationMembershipWhereInput {
  return {
    organizationId: input.organizationId,
    endedAt: null,
    status: { code: MASTER.membershipStatus.ACTIVE },
    ...(input.activeBranchId
      ? {
          branchScopes: {
            some: {
              status: { code: MASTER.assignmentStatus.ACTIVE },
              OR: [
                { scopeType: { code: MASTER.branchScopeType.ALL_BRANCHES } },
                { branchId: input.activeBranchId },
              ],
            },
          },
        }
      : {}),
  };
}

export function organizationRoleAssignmentWhere(input: {
  organizationId: string;
  activeBranchId?: string | null;
}): Prisma.OrganizationMembershipRoleWhereInput {
  return {
    revokedAt: null,
    status: { code: MASTER.assignmentStatus.ACTIVE },
    membership: organizationRoleMembershipWhere(input),
  };
}
