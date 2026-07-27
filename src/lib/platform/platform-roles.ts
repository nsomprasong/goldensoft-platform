import type { Prisma, PrismaClient } from "@prisma/client";

import {
  AdminGuardError,
  assertCanRemoveSuperAdmin,
} from "@/lib/platform/admin-guards";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSION_DESCRIPTIONS,
  PLATFORM_PERMISSION_LABELS,
  defaultPermissionsForPlatformRole,
  type PlatformPermission,
} from "@/lib/permissions/codes";

export class PlatformRoleAssignError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PlatformRoleAssignError";
  }
}

type Actor = { platformRoles: string[]; authUserId?: string };

function assertSuperAdmin(actor: Actor) {
  if (!actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) {
    throw new PlatformRoleAssignError(
      "FORBIDDEN",
      "เฉพาะ Super Admin เท่านั้นที่กำหนดบทบาทแพลตฟอร์มได้",
    );
  }
}

async function writeAudit(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    actorAuthUserId: string;
    actionCode: string;
    entityId: string;
    afterJson?: unknown;
    beforeJson?: unknown;
  },
) {
  const action = await db.auditActionType.upsert({
    where: { code: input.actionCode },
    create: {
      code: input.actionCode,
      nameTh: input.actionCode,
      nameEn: input.actionCode,
      sortOrder: 120,
      isActive: true,
      isSystem: true,
    },
    update: {},
    select: { id: true },
  });
  await db.auditLog.create({
    data: {
      actorAuthUserId: input.actorAuthUserId,
      actionTypeId: action.id,
      entityType: "platform_role_assignment",
      entityId: input.entityId,
      beforeJson: input.beforeJson as Prisma.InputJsonValue | undefined,
      afterJson: input.afterJson as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listAssignablePlatformRoles(db: PrismaClient) {
  return db.platformRole.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, nameTh: true, nameEn: true },
  });
}

export async function assignPlatformRole(
  db: PrismaClient,
  input: {
    actor: Actor;
    actorAuthUserId: string;
    userProfileId: string;
    roleId: string;
  },
) {
  assertSuperAdmin(input.actor);

  const [profile, role, activeStatus] = await Promise.all([
    db.userProfile.findFirst({
      where: { id: input.userProfileId, deletedAt: null },
      select: { id: true, displayName: true, email: true },
    }),
    db.platformRole.findFirst({
      where: { id: input.roleId, isActive: true },
      select: { id: true, code: true, nameTh: true },
    }),
    db.assignmentStatus.findUnique({
      where: { code: MASTER.assignmentStatus.ACTIVE },
    }),
  ]);
  if (!profile) {
    throw new PlatformRoleAssignError("NOT_FOUND", "ไม่พบผู้ใช้งาน");
  }
  if (!role || !activeStatus) {
    throw new PlatformRoleAssignError("NOT_FOUND", "ไม่พบบทบาทแพลตฟอร์ม");
  }

  const existing = await db.platformRoleAssignment.findFirst({
    where: {
      userProfileId: profile.id,
      roleId: role.id,
      statusId: activeStatus.id,
      revokedAt: null,
    },
  });
  if (existing) {
    throw new PlatformRoleAssignError(
      "ALREADY_ASSIGNED",
      "ผู้ใช้นี้มีบทบาทแพลตฟอร์มนี้แล้ว",
    );
  }

  const assignment = await db.platformRoleAssignment.create({
    data: {
      userProfileId: profile.id,
      roleId: role.id,
      statusId: activeStatus.id,
      assignedByAuthUserId: input.actorAuthUserId,
    },
    include: { role: { select: { code: true, nameTh: true } } },
  });

  await writeAudit(db, {
    actorAuthUserId: input.actorAuthUserId,
    actionCode: "platform_role.assign",
    entityId: assignment.id,
    afterJson: {
      userProfileId: profile.id,
      roleCode: role.code,
      email: profile.email,
    },
  });

  return assignment;
}

export async function revokePlatformRole(
  db: PrismaClient,
  input: {
    actor: Actor;
    actorAuthUserId: string;
    assignmentId: string;
  },
) {
  assertSuperAdmin(input.actor);

  const assignment = await db.platformRoleAssignment.findFirst({
    where: { id: input.assignmentId, revokedAt: null },
    include: {
      role: { select: { id: true, code: true, nameTh: true } },
      userProfile: { select: { id: true, email: true } },
    },
  });
  if (!assignment) {
    throw new PlatformRoleAssignError("NOT_FOUND", "ไม่พบการกำหนดบทบาท");
  }

  try {
    if (assignment.role.code === MASTER.platformRole.SUPER_ADMIN) {
      await assertCanRemoveSuperAdmin(db, assignment.userProfileId);
    }
  } catch (error) {
    if (error instanceof AdminGuardError) {
      throw new PlatformRoleAssignError(error.code, error.message);
    }
    throw error;
  }

  const updated = await db.platformRoleAssignment.update({
    where: { id: assignment.id },
    data: { revokedAt: new Date() },
  });

  await writeAudit(db, {
    actorAuthUserId: input.actorAuthUserId,
    actionCode: "platform_role.revoke",
    entityId: assignment.id,
    beforeJson: {
      userProfileId: assignment.userProfileId,
      roleCode: assignment.role.code,
      email: assignment.userProfile.email,
    },
  });

  return updated;
}

export class PlatformRoleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PlatformRoleError";
  }
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

export function displayPermissionCodesForPlatformRole(input: {
  code: string;
  dbPermissionCodes: string[];
}): string[] {
  if (input.dbPermissionCodes.length > 0) return input.dbPermissionCodes;
  return defaultPermissionsForPlatformRole(input.code);
}

export async function loadPlatformRolePermissionOverrides(
  db: PrismaClient,
  roleCodes: string[],
): Promise<Record<string, string[]>> {
  const unique = [...new Set(roleCodes)].filter(
    (code) => code && code !== MASTER.platformRole.SUPER_ADMIN,
  );
  if (unique.length === 0) return {};

  const roles = await db.platformRole.findMany({
    where: { code: { in: unique }, isActive: true },
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

export async function updatePlatformRole(
  db: PrismaClient,
  input: {
    actor: Actor;
    actorAuthUserId: string;
    roleId: string;
    description?: string | null;
    permissionCodes?: string[];
  },
) {
  assertSuperAdmin(input.actor);

  const role = await db.platformRole.findUnique({
    where: { id: input.roleId },
    include: {
      permissions: {
        where: { revokedAt: null },
        include: { permission: { select: { id: true, code: true } } },
      },
    },
  });
  if (!role) {
    throw new PlatformRoleError("NOT_FOUND", "ไม่พบบทบาทแพลตฟอร์ม");
  }

  const isSuperRole = role.code === MASTER.platformRole.SUPER_ADMIN;
  if (isSuperRole && input.permissionCodes) {
    throw new PlatformRoleError(
      "SUPER_ADMIN_LOCKED",
      "บทบาท SUPER_ADMIN มีสิทธิ์ทั้งหมดเสมอ ไม่สามารถแก้ชุดสิทธิ์ได้",
    );
  }
  if (
    !isSuperRole &&
    input.permissionCodes &&
    input.permissionCodes.length === 0
  ) {
    throw new PlatformRoleError(
      "PERMISSIONS_REQUIRED",
      "กรุณาเลือกสิทธิ์อย่างน้อยหนึ่งรายการ",
    );
  }

  // Resolve permission catalog outside the interactive transaction — many
  // sequential upserts against a remote pooler otherwise hit P2028 timeouts.
  let activePermissions: Array<{ id: string; code: string }> = [];
  let uniquePerms: string[] = [];
  if (!isSuperRole && input.permissionCodes) {
    uniquePerms = [...new Set(input.permissionCodes)];
    await ensurePermissionCatalog(db, uniquePerms);
    activePermissions = await db.permission.findMany({
      where: { code: { in: uniquePerms }, isActive: true },
      select: { id: true, code: true },
    });
    if (activePermissions.length !== uniquePerms.length) {
      throw new PlatformRoleError(
        "INACTIVE_PERMISSION",
        "มีสิทธิ์ที่ไม่ใช้งานหรือไม่พบในระบบ",
      );
    }
  }

  return db.$transaction(
    async (tx) => {
      const before = {
        description: role.description,
        permissionCodes: role.permissions.map((p) => p.permission.code),
      };

      const updated = await tx.platformRole.update({
        where: { id: role.id },
        data: {
          description:
            input.description === undefined
              ? role.description
              : input.description?.trim() || null,
        },
      });

      let nextPermissionCodes = before.permissionCodes;
      if (!isSuperRole && input.permissionCodes) {
        const currentCodes = new Set(before.permissionCodes);
        const nextCodes = new Set(uniquePerms);
        const toAdd = activePermissions.filter((p) => !currentCodes.has(p.code));
        const toRemove = role.permissions.filter(
          (p) => !nextCodes.has(p.permission.code),
        );

        if (toRemove.length > 0) {
          await tx.platformRolePermission.updateMany({
            where: { id: { in: toRemove.map((row) => row.id) } },
            data: { revokedAt: new Date() },
          });
        }

        for (const permission of toAdd) {
          const existing = await tx.platformRolePermission.findUnique({
            where: {
              platformRoleId_permissionId: {
                platformRoleId: role.id,
                permissionId: permission.id,
              },
            },
          });
          if (existing?.revokedAt) {
            await tx.platformRolePermission.update({
              where: { id: existing.id },
              data: { revokedAt: null, grantedAt: new Date() },
            });
          } else if (!existing) {
            await tx.platformRolePermission.create({
              data: {
                platformRoleId: role.id,
                permissionId: permission.id,
              },
            });
          }
        }
        nextPermissionCodes = uniquePerms;
      }

      await writeAudit(tx, {
        actorAuthUserId: input.actorAuthUserId,
        actionCode: MASTER.auditActionType.PLATFORM_ROLE_UPDATE,
        entityId: role.id,
        beforeJson: before,
        afterJson: {
          description: updated.description,
          permissionCodes: nextPermissionCodes,
          code: role.code,
        },
      });

      return updated;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}
