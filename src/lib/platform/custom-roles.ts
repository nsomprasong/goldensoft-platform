import type { Prisma, PrismaClient } from "@prisma/client";

import { canManageCustomerOrganization } from "@/lib/platform/customer-portfolio";
import type { ActorAccess } from "@/lib/platform/organizations-admin";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSION_DESCRIPTIONS,
  PLATFORM_PERMISSION_LABELS,
  PLATFORM_PERMISSIONS,
  defaultPermissionsForOrganizationRole,
  isOrganizationAssignablePermission,
  permissionsForRoles,
  type PlatformPermission,
} from "@/lib/permissions/codes";
import { loadPlatformRolePermissionOverrides } from "@/lib/platform/platform-roles";

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

function assertOrganizationAssignablePermissionCodes(codes: string[]) {
  const forbidden = codes.filter((code) => !isOrganizationAssignablePermission(code));
  if (forbidden.length > 0) {
    throw new CustomRoleError(
      "PLATFORM_PERMISSION_NOT_ALLOWED",
      "มีสิทธิ์ระดับแพลตฟอร์มที่ไม่สามารถกำหนดให้บทบาทองค์กรได้",
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

async function resolveAuditActionTypeId(
  db: Prisma.TransactionClient | PrismaClient,
  actionCode: string,
): Promise<string> {
  const action = await db.auditActionType.upsert({
    where: { code: actionCode },
    create: {
      code: actionCode,
      nameTh: actionCode,
      nameEn: actionCode,
      sortOrder: 100,
      isActive: true,
      isSystem: true,
    },
    update: {},
    select: { id: true },
  });
  return action.id;
}

async function writeAudit(
  db: Prisma.TransactionClient | PrismaClient,
  input: {
    organizationId: string | null;
    actorAuthUserId: string;
    actionTypeId: string;
    entityId: string;
    beforeJson?: unknown;
    afterJson?: unknown;
  },
) {
  await db.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorAuthUserId: input.actorAuthUserId,
      actionTypeId: input.actionTypeId,
      entityType: "organization_role",
      entityId: input.entityId,
      beforeJson: input.beforeJson as Prisma.InputJsonValue | undefined,
      afterJson: input.afterJson as Prisma.InputJsonValue | undefined,
    },
  });
}

async function ensurePermissionCatalog(
  db: Prisma.TransactionClient | PrismaClient,
  codes: string[],
) {
  const unique = [...new Set(codes)];
  if (unique.length === 0) return;
  const existing = await db.permission.findMany({
    where: { code: { in: unique } },
    select: { code: true, isActive: true },
  });
  const existingCodes = new Set(existing.map((row) => row.code));
  const inactive = existing.filter((row) => !row.isActive).map((row) => row.code);
  const missing = unique.filter((code) => !existingCodes.has(code));

  if (inactive.length > 0) {
    await db.permission.updateMany({
      where: { code: { in: inactive } },
      data: { isActive: true },
    });
  }
  if (missing.length === 0) return;

  await db.permission.createMany({
    data: missing.map((code, index) => {
      const parts = code.split(".");
      const resource = parts[1] ?? "other";
      const action = parts[2] ?? "read";
      const label =
        code in PLATFORM_PERMISSION_LABELS
          ? PLATFORM_PERMISSION_LABELS[code as PlatformPermission]
          : code;
      const description =
        code in PLATFORM_PERMISSION_DESCRIPTIONS
          ? PLATFORM_PERMISSION_DESCRIPTIONS[code as PlatformPermission]
          : null;
      return {
        code,
        nameTh: label,
        nameEn: code,
        descriptionTh: description,
        productCode: "PLATFORM",
        resource,
        action,
        sortOrder: 100 + index,
        isSystem: true,
        isActive: true,
      };
    }),
    skipDuplicates: true,
  });
}

async function syncRolePermissions(
  db: Prisma.TransactionClient,
  input: {
    roleId: string;
    currentPermissions: Array<{
      id: string;
      permission: { id: string; code: string };
    }>;
    permissionCodes: string[];
    activePermissions: Array<{ id: string; code: string }>;
  },
) {
  const uniquePerms = [...new Set(input.permissionCodes)];
  if (input.activePermissions.length !== uniquePerms.length) {
    throw new CustomRoleError(
      "INACTIVE_PERMISSION",
      "มีสิทธิ์ที่ไม่ใช้งานหรือไม่พบในระบบ",
    );
  }

  const currentCodes = new Set(
    input.currentPermissions.map((p) => p.permission.code),
  );
  const nextCodes = new Set(uniquePerms);
  const toAdd = input.activePermissions.filter((p) => !currentCodes.has(p.code));
  const toRemove = input.currentPermissions.filter(
    (p) => !nextCodes.has(p.permission.code),
  );

  if (toRemove.length > 0) {
    await db.organizationRolePermission.updateMany({
      where: { id: { in: toRemove.map((row) => row.id) } },
      data: { revokedAt: new Date() },
    });
  }

  for (const permission of toAdd) {
    const existing = await db.organizationRolePermission.findUnique({
      where: {
        organizationRoleId_permissionId: {
          organizationRoleId: input.roleId,
          permissionId: permission.id,
        },
      },
    });
    if (existing?.revokedAt) {
      await db.organizationRolePermission.update({
        where: { id: existing.id },
        data: { revokedAt: null, grantedAt: new Date() },
      });
    } else if (!existing) {
      await db.organizationRolePermission.create({
        data: {
          organizationRoleId: input.roleId,
          permissionId: permission.id,
        },
      });
    }
  }

  return uniquePerms;
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
  assertOrganizationAssignablePermissionCodes(uniquePerms);

  return db.$transaction(
    async (tx) => {
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

      const createActionId = await resolveAuditActionTypeId(
        tx,
        MASTER.auditActionType.CUSTOM_ROLE_CREATE,
      );
      await writeAudit(tx, {
        organizationId: input.organizationId,
        actorAuthUserId: input.actorAuthUserId,
        actionTypeId: createActionId,
        entityId: role.id,
        afterJson: {
          code: role.code,
          nameTh: role.nameTh,
          permissionCodes: uniquePerms,
        },
      });

      return role;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
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
  if (!role) {
    throw new CustomRoleError("NOT_FOUND", "ไม่พบบทบาท");
  }

  const isSuper = input.actor.platformRoles.includes(
    MASTER.platformRole.SUPER_ADMIN,
  );

  if (role.isSystem) {
    if (!isSuper) {
      throw new CustomRoleError(
        "SYSTEM_ROLE_IMMUTABLE",
        "เฉพาะผู้ดูแลระบบสูงสุดเท่านั้นที่แก้ไขสิทธิ์บทบาทระบบได้",
      );
    }
    if (input.isActive === false) {
      throw new CustomRoleError(
        "SYSTEM_ROLE_IMMUTABLE",
        "ไม่สามารถปิดใช้งานบทบาทระบบได้",
      );
    }
    if (!input.permissionCodes || input.permissionCodes.length === 0) {
      throw new CustomRoleError(
        "PERMISSIONS_REQUIRED",
        "กรุณาเลือกสิทธิ์อย่างน้อยหนึ่งรายการ",
      );
    }
  } else {
    if (!role.organizationId) {
      throw new CustomRoleError("NOT_FOUND", "ไม่พบบทบาท");
    }
    if (!(await canManageCustomRoles(input.actor, role.organizationId))) {
      throw new CustomRoleError("FORBIDDEN", "ไม่มีสิทธิ์จัดการบทบาท");
    }
  }

  let activePermissions: Array<{ id: string; code: string }> = [];
  if (input.permissionCodes) {
    const uniquePerms = [...new Set(input.permissionCodes)];
    assertOrganizationAssignablePermissionCodes(uniquePerms);
    await ensurePermissionCatalog(db, uniquePerms);
    activePermissions = await db.permission.findMany({
      where: { code: { in: uniquePerms }, isActive: true },
      select: { id: true, code: true },
    });
    if (activePermissions.length !== uniquePerms.length) {
      throw new CustomRoleError(
        "INACTIVE_PERMISSION",
        "มีสิทธิ์ที่ไม่ใช้งานหรือไม่พบในระบบ",
      );
    }
  }

  return db.$transaction(
    async (tx) => {
      const before = {
        nameTh: role.nameTh,
        nameEn: role.nameEn,
        description: role.description,
        isActive: role.isActive,
        permissionCodes: role.permissions.map((p) => p.permission.code),
      };

      if (!role.isSystem && input.isActive === false) {
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
        data: role.isSystem
          ? {
              // System roles: keep code/name locked; description may be clarified.
              description:
                input.description === undefined
                  ? role.description
                  : input.description?.trim() || null,
            }
          : {
              nameTh: input.nameTh?.trim() ?? role.nameTh,
              nameEn: input.nameEn?.trim() ?? role.nameEn,
              description:
                input.description === undefined
                  ? role.description
                  : input.description?.trim() || null,
              isActive: input.isActive ?? role.isActive,
            },
      });

      let nextPermissionCodes = before.permissionCodes;
      if (input.permissionCodes) {
        nextPermissionCodes = await syncRolePermissions(tx, {
          roleId: role.id,
          currentPermissions: role.permissions,
          permissionCodes: input.permissionCodes,
          activePermissions,
        });
      }

      const actionTypeId = await resolveAuditActionTypeId(
        tx,
        input.isActive === false
          ? MASTER.auditActionType.CUSTOM_ROLE_DEACTIVATE
          : MASTER.auditActionType.CUSTOM_ROLE_UPDATE,
      );
      await writeAudit(tx, {
        organizationId: role.organizationId,
        actorAuthUserId: input.actorAuthUserId,
        actionTypeId,
        entityId: role.id,
        beforeJson: before,
        afterJson: {
          nameTh: updated.nameTh,
          nameEn: updated.nameEn,
          description: updated.description,
          isActive: updated.isActive,
          permissionCodes: nextPermissionCodes,
        },
      });

      return updated;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

/** Permanently remove a custom org role when nothing still depends on it. */
export async function deleteCustomRole(
  db: PrismaClient,
  input: {
    actor: ActorAccess & { organizationRoles?: string[] };
    actorAuthUserId: string;
    roleId: string;
  },
) {
  const role = await db.organizationRole.findUnique({
    where: { id: input.roleId },
  });
  if (!role) {
    throw new CustomRoleError("NOT_FOUND", "ไม่พบบทบาท");
  }
  if (role.isSystem || !role.organizationId) {
    throw new CustomRoleError(
      "SYSTEM_ROLE_IMMUTABLE",
      "ไม่สามารถลบบทบาทระบบได้",
    );
  }
  if (!(await canManageCustomRoles(input.actor, role.organizationId))) {
    throw new CustomRoleError("FORBIDDEN", "ไม่มีสิทธิ์จัดการบทบาท");
  }

  const activeAssignments = await db.organizationMembershipRole.count({
    where: { roleId: role.id, revokedAt: null },
  });
  if (activeAssignments > 0) {
    throw new CustomRoleError(
      "ROLE_IN_USE",
      "ไม่สามารถลบบทบาทที่มีผู้ใช้ได้รับอยู่ — ถอดบทบาทออกจากผู้ใช้ก่อน",
    );
  }

  const invitationCount = await db.userInvitation.count({
    where: { organizationRoleId: role.id },
  });
  if (invitationCount > 0) {
    throw new CustomRoleError(
      "ROLE_IN_USE",
      "ไม่สามารถลบบทบาทที่มีคำเชิญอ้างอิงอยู่",
    );
  }

  return db.$transaction(
    async (tx) => {
      const before = {
        code: role.code,
        nameTh: role.nameTh,
        nameEn: role.nameEn,
        isActive: role.isActive,
      };

      await tx.organizationMembershipRole.deleteMany({
        where: { roleId: role.id },
      });
      await tx.organizationRole.delete({ where: { id: role.id } });

      const actionTypeId = await resolveAuditActionTypeId(
        tx,
        MASTER.auditActionType.CUSTOM_ROLE_DELETE,
      );
      await writeAudit(tx, {
        organizationId: role.organizationId,
        actorAuthUserId: input.actorAuthUserId,
        actionTypeId,
        entityId: role.id,
        beforeJson: before,
        afterJson: { deleted: true },
      });

      return { id: role.id, code: role.code };
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

/** Load active DB permission codes for system org roles (empty = use defaults). */
export async function loadSystemOrganizationRolePermissionOverrides(
  db: PrismaClient,
  roleCodes: string[],
): Promise<Record<string, string[]>> {
  const unique = [...new Set(roleCodes)].filter(Boolean);
  if (unique.length === 0) return {};

  const roles = await db.organizationRole.findMany({
    where: {
      code: { in: unique },
      isSystem: true,
      organizationId: null,
      isActive: true,
    },
    select: {
      code: true,
      permissions: {
        where: { revokedAt: null, permission: { isActive: true } },
        select: { permission: { select: { code: true } } },
      },
    },
  });

  const overrides: Record<string, string[]> = {};
  for (const role of roles) {
    if (role.permissions.length === 0) continue;
    overrides[role.code] = role.permissions.map((p) => p.permission.code);
  }
  return overrides;
}

/** Effective permission codes for page/API gates (platform + org system DB/defaults + custom). */
export async function resolveActorPermissionCodes(
  db: PrismaClient,
  input: {
    platformRoles: string[];
    organizationRoles: string[];
    organizationId?: string | null;
  },
): Promise<string[]> {
  if (input.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) {
    return Object.values(PLATFORM_PERMISSIONS).sort();
  }

  const systemCodes = new Set(Object.values(MASTER.organizationRole));
  const orgSystemRoles = input.organizationRoles.filter((code) =>
    systemCodes.has(code as never),
  );
  const customRoleCodes = input.organizationRoles.filter(
    (code) => !systemCodes.has(code as never),
  );

  const [orgOverrides, platformOverrides] = await Promise.all([
    loadSystemOrganizationRolePermissionOverrides(db, orgSystemRoles),
    loadPlatformRolePermissionOverrides(db, input.platformRoles),
  ]);
  const customPermissionCodes = input.organizationId
    ? await resolveCustomPermissionCodes(
        db,
        customRoleCodes,
        input.organizationId,
      )
    : [];

  return permissionsForRoles({
    platformRoles: input.platformRoles,
    organizationRoles: orgSystemRoles,
    organizationRolePermissionOverrides: orgOverrides,
    platformRolePermissionOverrides: platformOverrides,
    customPermissionCodes,
  });
}

/** Display codes for a role detail/edit form (DB first, else system defaults). */
export function displayPermissionCodesForRole(input: {
  isSystem: boolean;
  code: string;
  dbPermissionCodes: string[];
}): string[] {
  if (input.dbPermissionCodes.length > 0) return input.dbPermissionCodes;
  if (input.isSystem) {
    return defaultPermissionsForOrganizationRole(input.code);
  }
  return [];
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
