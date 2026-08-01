import "server-only";

import type { PrismaClient } from "@prisma/client";

import { invalidatePlatformUserBundleCache } from "@/lib/auth/platform-user-cache";
import { invalidateEffectiveCodesCache } from "@/lib/permissions/effective-codes-cache";
import { invalidateCustomerBootstrapCache } from "@/lib/platform/customer-bootstrap-cache";
import { MASTER } from "@/lib/platform/master-codes";

export class HomeBranchSyncError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "VALIDATION" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "HomeBranchSyncError";
  }
}

/**
 * Sync a Platform membership home branch after HR transfers an employee.
 * - SELECTED / NONE → lock membership to the new branch
 * - ALL_BRANCHES (OWNER/ADMIN) → keep org-wide access, update lastBranchId only
 * Invalidates session caches so the next login/bootstrap sees the new branch.
 */
export async function syncPlatformHomeBranch(
  db: PrismaClient,
  input: {
    organizationId: string;
    platformUserId: string;
    branchId: string;
    actorAuthUserId?: string | null;
  },
): Promise<{
  authUserId: string;
  membershipId: string;
  scopeTypeCode: "ALL_BRANCHES" | "SELECTED";
  branchId: string;
}> {
  const profile = await db.userProfile.findFirst({
    where: { id: input.platformUserId, deletedAt: null },
    select: { id: true, authUserId: true },
  });
  if (!profile) {
    throw new HomeBranchSyncError("NOT_FOUND", "ไม่พบบัญชี Platform ของพนักงาน");
  }

  const membership = await db.organizationMembership.findFirst({
    where: {
      organizationId: input.organizationId,
      userProfileId: profile.id,
      endedAt: null,
      status: { code: MASTER.membershipStatus.ACTIVE },
    },
    select: {
      id: true,
      branchScopes: {
        where: { status: { code: MASTER.assignmentStatus.ACTIVE } },
        select: { scopeType: { select: { code: true } } },
      },
    },
  });
  if (!membership) {
    throw new HomeBranchSyncError(
      "NOT_FOUND",
      "ไม่พบสมาชิกภาพองค์กรของพนักงานใน Platform",
    );
  }

  const branch = await db.branch.findFirst({
    where: {
      id: input.branchId,
      organizationId: input.organizationId,
      deletedAt: null,
      status: { code: MASTER.branchStatus.ACTIVE },
    },
    select: { id: true },
  });
  if (!branch) {
    throw new HomeBranchSyncError(
      "VALIDATION",
      "สาขาปลายทางไม่ได้อยู่ในองค์กรนี้",
    );
  }

  const hasAllBranches = membership.branchScopes.some(
    (row) => row.scopeType.code === MASTER.branchScopeType.ALL_BRANCHES,
  );

  const selectedType = await db.branchScopeType.findUniqueOrThrow({
    where: { code: MASTER.branchScopeType.SELECTED },
  });
  const assignmentActive = await db.assignmentStatus.findUniqueOrThrow({
    where: { code: MASTER.assignmentStatus.ACTIVE },
  });

  await db.$transaction(async (tx) => {
    if (!hasAllBranches) {
      await tx.organizationMembershipBranchScope.deleteMany({
        where: { membershipId: membership.id },
      });
      await tx.organizationMembershipBranchScope.create({
        data: {
          membershipId: membership.id,
          scopeTypeId: selectedType.id,
          branchId: branch.id,
          statusId: assignmentActive.id,
        },
      });
    }

    await tx.userPreference.upsert({
      where: { userProfileId: profile.id },
      create: {
        userProfileId: profile.id,
        lastOrganizationId: input.organizationId,
        lastBranchId: branch.id,
      },
      update: {
        lastOrganizationId: input.organizationId,
        lastBranchId: branch.id,
      },
    });

    if (input.actorAuthUserId) {
      const audit = await tx.auditActionType.upsert({
        where: { code: MASTER.auditActionType.MEMBERSHIP_UPDATE },
        create: {
          code: MASTER.auditActionType.MEMBERSHIP_UPDATE,
          nameTh: "แก้ไขสมาชิกภาพ",
          nameEn: "Update membership",
          sortOrder: 45,
          isActive: true,
          isSystem: true,
        },
        update: {},
      });
      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorAuthUserId: input.actorAuthUserId,
          actionTypeId: audit.id,
          entityType: "hr_home_branch_sync",
          entityId: membership.id,
          afterJson: {
            platformUserId: profile.id,
            branchId: branch.id,
            scopeTypeCode: hasAllBranches ? "ALL_BRANCHES" : "SELECTED",
            source: "hr_employee_transfer",
          },
        },
      });
    }
  });

  invalidatePlatformUserBundleCache(profile.authUserId);
  invalidateCustomerBootstrapCache(profile.authUserId);
  invalidateEffectiveCodesCache(profile.authUserId);

  return {
    authUserId: profile.authUserId,
    membershipId: membership.id,
    scopeTypeCode: hasAllBranches ? "ALL_BRANCHES" : "SELECTED",
    branchId: branch.id,
  };
}

export function assertPlatformInternalSecret(
  headerValue: string | null,
): boolean {
  const expected = process.env.PLATFORM_CONTEXT_COOKIE_SECRET?.trim();
  if (!expected || !headerValue) return false;
  return headerValue === expected;
}
