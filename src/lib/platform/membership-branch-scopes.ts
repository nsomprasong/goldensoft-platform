import type { PrismaClient } from "@prisma/client";

import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import type { ActorAccess } from "@/lib/platform/organizations-admin";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";

export class BranchScopeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BranchScopeError";
  }
}

async function assertCanManageMembership(
  actor: ActorAccess & { organizationRoles?: string[] },
  organizationId: string,
) {
  if (actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) return;
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles ?? [],
  });
  if (
    !perms.includes(PLATFORM_PERMISSIONS.userManage) &&
    !perms.includes(PLATFORM_PERMISSIONS.roleAssign)
  ) {
    throw new BranchScopeError("FORBIDDEN", TH.common.forbidden);
  }
  if (!actor.membershipOrganizationIds.includes(organizationId)) {
    throw new BranchScopeError("FORBIDDEN", TH.common.forbidden);
  }
}

export async function setMembershipBranchScope(
  db: PrismaClient,
  input: {
    actor: ActorAccess & { organizationRoles?: string[] };
    actorAuthUserId: string;
    membershipId: string;
    scopeTypeCode: "ALL_BRANCHES" | "SELECTED" | "NONE";
    branchIds?: string[];
  },
) {
  const membership = await db.organizationMembership.findUnique({
    where: { id: input.membershipId },
    select: { id: true, organizationId: true },
  });
  if (!membership) {
    throw new BranchScopeError("NOT_FOUND", "ไม่พบสมาชิก");
  }
  await assertCanManageMembership(input.actor, membership.organizationId);

  const scopeType = await db.branchScopeType.findUnique({
    where: { code: input.scopeTypeCode },
  });
  const assignmentActive = await db.assignmentStatus.findUnique({
    where: { code: MASTER.assignmentStatus.ACTIVE },
  });
  if (!scopeType || !assignmentActive) {
    throw new BranchScopeError("VALIDATION", "ข้อมูลหลักไม่ครบ");
  }

  const branchIds =
    input.scopeTypeCode === "SELECTED" ? (input.branchIds ?? []) : [];
  if (input.scopeTypeCode === "SELECTED" && branchIds.length === 0) {
    throw new BranchScopeError(
      "VALIDATION",
      "ต้องเลือกอย่างน้อยหนึ่งสาขาเมื่อใช้ขอบเขตเฉพาะสาขา",
    );
  }

  if (branchIds.length > 0) {
    const valid = await db.branch.findMany({
      where: {
        id: { in: branchIds },
        organizationId: membership.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (valid.length !== branchIds.length) {
      throw new BranchScopeError(
        "VALIDATION",
        "พบสาขาที่ไม่ได้อยู่ในองค์กรนี้",
      );
    }
  }

  return db.$transaction(async (tx) => {
    await tx.organizationMembershipBranchScope.deleteMany({
      where: { membershipId: membership.id },
    });

    if (input.scopeTypeCode === "ALL_BRANCHES" || input.scopeTypeCode === "NONE") {
      await tx.organizationMembershipBranchScope.create({
        data: {
          membershipId: membership.id,
          scopeTypeId: scopeType.id,
          branchId: null,
          statusId: assignmentActive.id,
        },
      });
    } else {
      for (const branchId of branchIds) {
        await tx.organizationMembershipBranchScope.create({
          data: {
            membershipId: membership.id,
            scopeTypeId: scopeType.id,
            branchId,
            statusId: assignmentActive.id,
          },
        });
      }
    }

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
        organizationId: membership.organizationId,
        actorAuthUserId: input.actorAuthUserId,
        actionTypeId: audit.id,
        entityType: "organization_membership_branch_scope",
        entityId: membership.id,
        afterJson: {
          scopeTypeCode: input.scopeTypeCode,
          branchIds,
        },
      },
    });

    return { scopeTypeCode: input.scopeTypeCode, branchIds };
  });
}
