import type { PrismaClient } from "@prisma/client";

import {
  countActiveOwners,
  wouldRemoveLastOwner,
} from "@/lib/platform/admin-guards";
import { canManageCustomerOrganization } from "@/lib/platform/customer-portfolio";
import type { ActorAccess } from "@/lib/platform/organizations-admin";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";

export class RoleAssignmentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RoleAssignmentError";
  }
}

async function assertCanAssign(
  actor: ActorAccess & { organizationRoles?: string[] },
  organizationId: string,
) {
  if (actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) return;
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles ?? [],
  });
  if (!perms.includes(PLATFORM_PERMISSIONS.roleAssign)) {
    throw new RoleAssignmentError("FORBIDDEN", "ไม่มีสิทธิ์กำหนดบทบาท");
  }
  const hasMembership = actor.membershipOrganizationIds.includes(organizationId);
  const hasManagedAccess = canManageCustomerOrganization(actor, organizationId);
  if (!hasMembership && !hasManagedAccess) {
    throw new RoleAssignmentError("FORBIDDEN", "ไม่มีสิทธิ์กำหนดบทบาท");
  }
}

export async function assignMembershipRole(
  db: PrismaClient,
  input: {
    actor: ActorAccess & { organizationRoles?: string[] };
    actorAuthUserId: string;
    membershipId: string;
    roleId: string;
  },
) {
  const membership = await db.organizationMembership.findUnique({
    where: { id: input.membershipId },
    select: { id: true, organizationId: true },
  });
  if (!membership) {
    throw new RoleAssignmentError("NOT_FOUND", "ไม่พบสมาชิก");
  }
  await assertCanAssign(input.actor, membership.organizationId);

  const platformRole = await db.platformRole.findUnique({
    where: { id: input.roleId },
    select: { id: true },
  });
  if (platformRole) {
    throw new RoleAssignmentError(
      "ROLE_SCOPE_MISMATCH",
      "บทบาทระดับแพลตฟอร์มไม่สามารถกำหนดให้สมาชิกหรือพนักงานขององค์กรได้",
    );
  }

  const role = await db.organizationRole.findFirst({
    where: {
      id: input.roleId,
      isActive: true,
      OR: [
        { organizationId: null, isSystem: true },
        { organizationId: membership.organizationId },
      ],
    },
  });
  if (!role) {
    throw new RoleAssignmentError("ROLE_NOT_FOUND", "ไม่พบบทบาทในองค์กรนี้");
  }

  const assignmentActive = await db.assignmentStatus.findUniqueOrThrow({
    where: { code: MASTER.assignmentStatus.ACTIVE },
  });

  const existing = await db.organizationMembershipRole.findFirst({
    where: {
      membershipId: membership.id,
      roleId: role.id,
      revokedAt: null,
      statusId: assignmentActive.id,
    },
  });
  if (existing) {
    return existing;
  }

  const revoked = await db.organizationMembershipRole.findFirst({
    where: { membershipId: membership.id, roleId: role.id },
    orderBy: { assignedAt: "desc" },
  });

  const row = revoked
    ? await db.organizationMembershipRole.update({
        where: { id: revoked.id },
        data: {
          revokedAt: null,
          statusId: assignmentActive.id,
          assignedAt: new Date(),
        },
      })
    : await db.organizationMembershipRole.create({
        data: {
          membershipId: membership.id,
          roleId: role.id,
          statusId: assignmentActive.id,
        },
      });

  if (!role.isSystem) {
    await db.organizationRole.update({
      where: { id: role.id },
      data: { codeLocked: true },
    });
  }

  const action = await db.auditActionType.upsert({
    where: { code: MASTER.auditActionType.ROLE_ASSIGN },
    create: {
      code: MASTER.auditActionType.ROLE_ASSIGN,
      nameTh: "กำหนดบทบาท",
      nameEn: "Assign role",
      sortOrder: 50,
      isActive: true,
      isSystem: true,
    },
    update: {},
  });
  await db.auditLog.create({
    data: {
      organizationId: membership.organizationId,
      actorAuthUserId: input.actorAuthUserId,
      actionTypeId: action.id,
      entityType: "organization_membership_role",
      entityId: row.id,
      afterJson: { membershipId: membership.id, roleCode: role.code },
    },
  });

  return row;
}

export async function revokeMembershipRole(
  db: PrismaClient,
  input: {
    actor: ActorAccess & { organizationRoles?: string[] };
    actorAuthUserId: string;
    membershipRoleId: string;
  },
) {
  const row = await db.organizationMembershipRole.findUnique({
    where: { id: input.membershipRoleId },
    include: {
      role: true,
      membership: { select: { organizationId: true } },
      status: { select: { code: true } },
    },
  });
  if (!row || row.revokedAt) {
    throw new RoleAssignmentError("NOT_FOUND", "ไม่พบการกำหนดบทบาท");
  }
  await assertCanAssign(input.actor, row.membership.organizationId);

  if (row.role.code === MASTER.organizationRole.OWNER) {
    const owners = await countActiveOwners(
      db,
      row.membership.organizationId,
    );
    if (wouldRemoveLastOwner(owners)) {
      throw new RoleAssignmentError(
        "LAST_OWNER",
        "ไม่สามารถถอด OWNER คนสุดท้ายขององค์กรได้",
      );
    }
  }

  const revokedStatus = await db.assignmentStatus.findUniqueOrThrow({
    where: { code: MASTER.assignmentStatus.REVOKED },
  });

  const updated = await db.organizationMembershipRole.update({
    where: { id: row.id },
    data: { revokedAt: new Date(), statusId: revokedStatus.id },
  });

  const action = await db.auditActionType.upsert({
    where: { code: MASTER.auditActionType.ROLE_REMOVE },
    create: {
      code: MASTER.auditActionType.ROLE_REMOVE,
      nameTh: "ถอดบทบาท",
      nameEn: "Remove role",
      sortOrder: 51,
      isActive: true,
      isSystem: true,
    },
    update: {},
  });
  await db.auditLog.create({
    data: {
      organizationId: row.membership.organizationId,
      actorAuthUserId: input.actorAuthUserId,
      actionTypeId: action.id,
      entityType: "organization_membership_role",
      entityId: row.id,
      beforeJson: { roleCode: row.role.code },
    },
  });

  return updated;
}
