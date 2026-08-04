import { z } from "zod";

import type { PrismaClient } from "@prisma/client";

import { TH } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { writeAuditLog } from "@/lib/platform/audit";
import { MASTER } from "@/lib/platform/master-codes";
import { requireActiveMasterId } from "@/lib/platform/master-data";
import type { ActorAccess } from "@/lib/platform/organizations-admin";
import {
  canManageOrganization,
  canViewOrganization,
} from "@/lib/platform/organizations-admin";

function assertBranchManage(
  actor: ActorAccess & { organizationRoles?: string[] },
  organizationId: string,
) {
  if (!canManageOrganization(actor, organizationId)) {
    throw new BranchAdminError("FORBIDDEN", TH.common.forbidden);
  }
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles ?? [],
  });
  if (!perms.includes(PLATFORM_PERMISSIONS.branchManage)) {
    throw new BranchAdminError("FORBIDDEN", TH.common.forbidden);
  }
}

export class BranchAdminError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CODE_IMMUTABLE"
    | "CODE_DUPLICATE"
    | "PRIMARY_INACTIVE"
    | "PRIMARY_REQUIRED"
    | "VALIDATION";

  constructor(code: BranchAdminError["code"], message: string) {
    super(message);
    this.name = "BranchAdminError";
    this.code = code;
  }
}

export const createBranchSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  timezone: z.string().trim().max(64).optional(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  attendanceRadiusMeters: z.number().int().positive().optional().nullable(),
  isPrimary: z.boolean().optional(),
});

export const updateBranchSchema = createBranchSchema
  .partial()
  .extend({
    code: z.string().optional(),
  });

export async function listBranches(
  db: PrismaClient,
  actor: ActorAccess,
  organizationId: string,
  options?: { activeBranchId?: string | null },
) {
  if (!canViewOrganization(actor, organizationId)) {
    throw new BranchAdminError("FORBIDDEN", TH.common.forbidden);
  }

  const rows = await db.branch.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(options?.activeBranchId
        ? { id: options.activeBranchId }
        : {}),
    },
    select: {
      id: true,
      organizationId: true,
      code: true,
      name: true,
      statusId: true,
      timezone: true,
      address: true,
      latitude: true,
      longitude: true,
      attendanceRadiusMeters: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      // Phase 5 columns (nameEn/email/phone/isPrimary) require migration 0002
      status: { select: { id: true, code: true, nameTh: true, nameEn: true } },
    },
    orderBy: { code: "asc" },
  });
  return rows;
}

export async function createBranch(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  organizationId: string,
  input: z.infer<typeof createBranchSchema>,
) {
  assertBranchManage(actor, organizationId);
  const parsed = createBranchSchema.parse(input);

  try {
    return await db.$transaction(async (tx) => {
      const statusId = await requireActiveMasterId(
        tx,
        "branchStatus",
        MASTER.branchStatus.ACTIVE,
      );

      // isPrimary / nameEn / email / phone require migration 0002
      const created = await tx.branch.create({
        data: {
          organizationId,
          code: parsed.code,
          name: parsed.name,
          address: parsed.address ?? null,
          timezone: parsed.timezone ?? "Asia/Bangkok",
          latitude: parsed.latitude ?? null,
          longitude: parsed.longitude ?? null,
          attendanceRadiusMeters: parsed.attendanceRadiusMeters ?? null,
          statusId,
        },
      });

      await writeAuditLog(tx, {
        organizationId,
        actorAuthUserId: actor.authUserId,
        actionCode: MASTER.auditActionType.BRANCH_CREATE,
        entityType: "Branch",
        entityId: created.id,
        after: { code: created.code, name: created.name },
      });
      return created;
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new BranchAdminError("CODE_DUPLICATE", "รหัสสาขาซ้ำในองค์กรนี้");
    }
    throw error;
  }
}

export async function updateBranch(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  organizationId: string,
  branchId: string,
  input: z.infer<typeof updateBranchSchema>,
) {
  assertBranchManage(actor, organizationId);
  const parsed = updateBranchSchema.parse(input);
  if (parsed.code !== undefined) {
    throw new BranchAdminError("CODE_IMMUTABLE", TH.branch.codeImmutable);
  }

  const existing = await db.branch.findFirst({
    where: { id: branchId, organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: { select: { code: true } },
    },
  });
  if (!existing) {
    throw new BranchAdminError("NOT_FOUND", TH.common.notFound);
  }

  return db.$transaction(async (tx) => {
    // isPrimary / nameEn / email / phone require migration 0002
    const updated = await tx.branch.update({
      where: { id: branchId },
      data: {
        name: parsed.name,
        address: parsed.address,
        timezone: parsed.timezone,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        attendanceRadiusMeters: parsed.attendanceRadiusMeters,
      },
    });

    await writeAuditLog(tx, {
      organizationId,
      actorAuthUserId: actor.authUserId,
      actionCode: MASTER.auditActionType.BRANCH_UPDATE,
      entityType: "Branch",
      entityId: branchId,
      before: { name: existing.name },
      after: { name: updated.name },
    });
    return updated;
  });
}

export async function suspendBranch(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  organizationId: string,
  branchId: string,
) {
  assertBranchManage(actor, organizationId);

  const existing = await db.branch.findFirst({
    where: { id: branchId, organizationId, deletedAt: null },
    select: {
      id: true,
      status: { select: { code: true } },
    },
  });
  if (!existing) {
    throw new BranchAdminError("NOT_FOUND", TH.common.notFound);
  }

  return db.$transaction(async (tx) => {
    const statusId = await requireActiveMasterId(
      tx,
      "branchStatus",
      MASTER.branchStatus.INACTIVE,
    );
    const updated = await tx.branch.update({
      where: { id: branchId },
      data: { statusId },
    });
    await writeAuditLog(tx, {
      organizationId,
      actorAuthUserId: actor.authUserId,
      actionCode: MASTER.auditActionType.BRANCH_SUSPEND,
      entityType: "Branch",
      entityId: branchId,
      before: { status: existing.status.code },
      after: { status: MASTER.branchStatus.INACTIVE },
    });
    return updated;
  });
}
