import type { Prisma, PrismaClient } from "@prisma/client";

import { canManageCustomerOrganization } from "@/lib/platform/customer-portfolio";
import type { ActorAccess } from "@/lib/platform/organizations-admin";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";

export class CustomRoleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CustomRoleError";
  }
}

const ROLE_CODE_RE = /^[A-Z][A-Z0-9_]{1,47}$/;

function assertRoleCode(code: string) {
  if (!ROLE_CODE_RE.test(code)) {
    throw new CustomRoleError(
      "INVALID_ROLE_CODE",
      "รหัสบทบาทต้องเป็นตัวพิมพ์ใหญ่ A-Z เริ่มต้น และใช้ได้เฉพาะตัวอักษร ตัวเลข และ _",
    );
  }
}

export async function canManageCustomRoles(
  actor: ActorAccess & { organizationRoles?: string[] },
  organizationId: string,
): Promise<boolean> {
  if (actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) {
    return true;
  }
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles ?? [],
  });
  if (!perms.includes(PLATFORM_PERMISSIONS.roleManage)) {
    return false;
  }
  return (
    actor.membershipOrganizationIds.includes(organizationId) ||
    canManageCustomerOrganization(actor, organizationId)
  );
}

async function writeAudit(
  db: Prisma.TransactionClient | PrismaClient,
  input: {
    organizationId: string;
    actorAuthUserId: string;
    actionCode: string;
    entityId: string;
    beforeJson?: unknown;
    afterJson?: unknown;
  },
) {
  const action = await db.auditActionType.upsert({
    where: { code: input.actionCode },
    create: {
      code: input.actionCode,
      nameTh: input.actionCode,
      nameEn: input.actionCode,
      sortOrder: 100,
      isActive: true,
      isSystem: true,
    },
    update: {},
  });
  await db.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorAuthUserId: input.actorAuthUserId,
      actionTypeId: action.id,
      entityType: "organization_role",
      entityId: input.entityId,
      beforeJson: input.beforeJson as Prisma.InputJsonValue | undefined,
      afterJson: input.afterJson as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listOrganizationRoles(
  db: PrismaClient,
  organizationId: string,
) {
  return db.organizationRole.findMany({
    where: {
      OR: [{ organizationId: null, isSystem: true }, { organizationId }],
    },
    orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      nameTh: true,
      nameEn: true,
      description: true,
      organizationId: true,
      isSystem: true,
      isActive: true,
      codeLocked: true,
      permissions: {
        where: { revokedAt: null },
        select: {
          permission: {
            select: {
              code: true,
              nameTh: true,
              descriptionTh: true,
              resource: true,
              action: true,
              isActive: true,
            },
          },
        },
      },
      _count: {
        select: {
          assignments: {
            where: { revokedAt: null },
          },
        },
      },
    },
  });
}

export async function createCustomRole(
  db: PrismaClient,
  input: {
    actor: ActorAccess & { organizationRoles?: string[] };
    actorAuthUserId: string;
    organizationId: string;
    code: string;
    nameTh: string;
    nameEn: string;
    description?: string | null;
    permissionCodes: string[];
  },
) {
  if (!(await canManageCustomRoles(input.actor, input.organizationId))) {
    throw new CustomRoleError("FORBIDDEN", "ไม่มีสิทธิ์จัดการบทบาท");
  }

  const code = input.code.trim().toUpperCase();
  assertRoleCode(code);

  if (
    Object.values(MASTER.organizationRole).includes(
      code as (typeof MASTER.organizationRole)[keyof typeof MASTER.organizationRole],
    )
  ) {
    throw new CustomRoleError(
      "SYSTEM_ROLE_CODE",
      "ไม่สามารถใช้รหัสบทบาทระบบได้",
    );
  }

  const uniquePerms = [...new Set(input.permissionCodes)];
  if (uniquePerms.length === 0) {
    throw new CustomRoleError(
      "PERMISSIONS_REQUIRED",
      "ต้องเลือกสิทธิ์อย่างน้อย 1 รายการ",
    );
  }

  return db.$transaction(async (tx) => {
    const activePermissions = await tx.permission.findMany({
      where: { code: { in: uniquePerms }, isActive: true },
      select: { id: true, code: true },
    });
    if (activePermissions.length !== uniquePerms.length) {
      throw new CustomRoleError(
        "INACTIVE_PERMISSION",
        "มีสิทธิ์ที่ไม่ใช้งานหรือไม่พบในระบบ",
      );
    }

    const existing = await tx.organizationRole.findFirst({
      where: { organizationId: input.organizationId, code },
      select: { id: true },
    });
    if (existing) {
      throw new CustomRoleError(
        "ROLE_CODE_EXISTS",
        "รหัสบทบาทนี้มีอยู่แล้วในองค์กร",
      );
    }

    const role = await tx.organizationRole.create({
      data: {
        code,
        nameTh: input.nameTh.trim(),
        nameEn: input.nameEn.trim(),
        description: input.description?.trim() || null,
        organizationId: input.organizationId,
        isSystem: false,
        isActive: true,
        codeLocked: false,
        sortOrder: 100,
      },
    });

    await tx.organizationRolePermission.createMany({
      data: activePermissions.map((p) => ({
        organizationRoleId: role.id,
        permissionId: p.id,
      })),
    });

    await writeAudit(tx, {
      organizationId: input.organizationId,
      actorAuthUserId: input.actorAuthUserId,
      actionCode: MASTER.auditActionType.CUSTOM_ROLE_CREATE,
      entityId: role.id,
      afterJson: {
        code: role.code,
        nameTh: role.nameTh,
        permissionCodes: uniquePerms,
      },
    });

    for (const permission of activePermissions) {
      await writeAudit(tx, {
        organizationId: input.organizationId,
        actorAuthUserId: input.actorAuthUserId,
        actionCode: MASTER.auditActionType.CUSTOM_ROLE_PERMISSION_ADD,
        entityId: role.id,
        afterJson: { permissionCode: permission.code },
      });
    }

    return role;
  });
}

export async function updateCustomRole(
  db: PrismaClient,
  input: {
    actor: ActorAccess & { organizationRoles?: string[] };
    actorAuthUserId: string;
    roleId: string;
    nameTh?: string;
    nameEn?: string;
    description?: string | null;
    permissionCodes?: string[];
    isActive?: boolean;
  },
) {
  const role = await db.organizationRole.findUnique({
    where: { id: input.roleId },
    include: {
      permissions: {
        where: { revokedAt: null },
        include: { permission: { select: { code: true, id: true } } },
      },
    },
  });
  if (!role || !role.organizationId) {
    throw new CustomRoleError("NOT_FOUND", "ไม่พบบทบาท");
  }
  if (role.isSystem) {
    throw new CustomRoleError(
      "SYSTEM_ROLE_IMMUTABLE",
      "ไม่สามารถแก้ไขบทบาทระบบในเฟสนี้",
    );
  }
  if (!(await canManageCustomRoles(input.actor, role.organizationId))) {
    throw new CustomRoleError("FORBIDDEN", "ไม่มีสิทธิ์จัดการบทบาท");
  }

  return db.$transaction(async (tx) => {
    const before = {
      nameTh: role.nameTh,
      nameEn: role.nameEn,
      description: role.description,
      isActive: role.isActive,
      permissionCodes: role.permissions.map((p) => p.permission.code),
    };

    if (input.isActive === false) {
      const activeAssignments = await tx.organizationMembershipRole.count({
        where: { roleId: role.id, revokedAt: null },
      });
      if (activeAssignments > 0) {
        throw new CustomRoleError(
          "ROLE_IN_USE",
          "ไม่สามารถปิดใช้งานบทบาทที่มีผู้ใช้ได้รับอยู่",
        );
      }
    }

    const updated = await tx.organizationRole.update({
      where: { id: role.id },
      data: {
        nameTh: input.nameTh?.trim() ?? role.nameTh,
        nameEn: input.nameEn?.trim() ?? role.nameEn,
        description:
          input.description === undefined
            ? role.description
            : input.description?.trim() || null,
        isActive: input.isActive ?? role.isActive,
      },
    });

    if (input.permissionCodes) {
      const uniquePerms = [...new Set(input.permissionCodes)];
      const activePermissions = await tx.permission.findMany({
        where: { code: { in: uniquePerms }, isActive: true },
        select: { id: true, code: true },
      });
      if (activePermissions.length !== uniquePerms.length) {
        throw new CustomRoleError(
          "INACTIVE_PERMISSION",
          "มีสิทธิ์ที่ไม่ใช้งานหรือไม่พบในระบบ",
        );
      }

      const currentCodes = new Set(before.permissionCodes);
      const nextCodes = new Set(uniquePerms);
      const toAdd = activePermissions.filter((p) => !currentCodes.has(p.code));
      const toRemove = role.permissions.filter(
        (p) => !nextCodes.has(p.permission.code),
      );

      for (const row of toRemove) {
        await tx.organizationRolePermission.update({
          where: { id: row.id },
          data: { revokedAt: new Date() },
        });
        await writeAudit(tx, {
          organizationId: role.organizationId!,
          actorAuthUserId: input.actorAuthUserId,
          actionCode: MASTER.auditActionType.CUSTOM_ROLE_PERMISSION_REMOVE,
          entityId: role.id,
          beforeJson: { permissionCode: row.permission.code },
        });
      }

      for (const permission of toAdd) {
        const existing = await tx.organizationRolePermission.findUnique({
          where: {
            organizationRoleId_permissionId: {
              organizationRoleId: role.id,
              permissionId: permission.id,
            },
          },
        });
        if (existing?.revokedAt) {
          await tx.organizationRolePermission.update({
            where: { id: existing.id },
            data: { revokedAt: null, grantedAt: new Date() },
          });
        } else if (!existing) {
          await tx.organizationRolePermission.create({
            data: {
              organizationRoleId: role.id,
              permissionId: permission.id,
            },
          });
        }
        await writeAudit(tx, {
          organizationId: role.organizationId!,
          actorAuthUserId: input.actorAuthUserId,
          actionCode: MASTER.auditActionType.CUSTOM_ROLE_PERMISSION_ADD,
          entityId: role.id,
          afterJson: { permissionCode: permission.code },
        });
      }
    }

    await writeAudit(tx, {
      organizationId: role.organizationId!,
      actorAuthUserId: input.actorAuthUserId,
      actionCode:
        input.isActive === false
          ? MASTER.auditActionType.CUSTOM_ROLE_DEACTIVATE
          : MASTER.auditActionType.CUSTOM_ROLE_UPDATE,
      entityId: role.id,
      beforeJson: before,
      afterJson: {
        nameTh: updated.nameTh,
        nameEn: updated.nameEn,
        description: updated.description,
        isActive: updated.isActive,
        permissionCodes: input.permissionCodes ?? before.permissionCodes,
      },
    });

    return updated;
  });
}

export async function resolveCustomPermissionCodes(
  db: PrismaClient,
  roleCodes: string[],
  organizationId: string | null,
): Promise<string[]> {
  if (!organizationId || roleCodes.length === 0) return [];
  const systemCodes = new Set(Object.values(MASTER.organizationRole));
  const customCodes = roleCodes.filter((c) => !systemCodes.has(c as never));
  if (customCodes.length === 0) return [];

  const roles = await db.organizationRole.findMany({
    where: {
      organizationId,
      code: { in: customCodes },
      isActive: true,
      isSystem: false,
    },
    select: {
      permissions: {
        where: { revokedAt: null, permission: { isActive: true } },
        select: { permission: { select: { code: true } } },
      },
    },
  });

  return [
    ...new Set(
      roles.flatMap((r) => r.permissions.map((p) => p.permission.code)),
    ),
  ];
}
