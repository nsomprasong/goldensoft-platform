import type { Prisma, PrismaClient } from "@prisma/client";

import { TH } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { writeAuditLog } from "@/lib/platform/audit";
import { MASTER } from "@/lib/platform/master-codes";

type Db = PrismaClient | Prisma.TransactionClient;

export class CustomerPortfolioError extends Error {
  readonly code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION";

  constructor(code: CustomerPortfolioError["code"], message: string) {
    super(message);
    this.name = "CustomerPortfolioError";
    this.code = code;
  }
}

/** Minimal actor shape needed for portfolio authorization decisions. */
export type PortfolioActor = {
  authUserId?: string;
  profileId?: string | null;
  platformRoles: string[];
  permissionCodes?: string[];
  managedOrganizationIds: string[];
};

/** Active (non-revoked) customer organizations assigned to a staff profile. */
export async function listActiveManagedOrganizationIds(
  db: Db,
  staffUserProfileId: string,
): Promise<string[]> {
  const rows = await db.staffOrganizationAssignment.findMany({
    where: { staffUserProfileId, revokedAt: null },
    select: { organizationId: true },
  });
  return [...new Set(rows.map((row) => row.organizationId))];
}

export async function resolveActiveCustomerAssignmentScope(
  db: Db,
  staffUserProfileId: string,
  organizationId: string,
): Promise<{ assignmentId: string; allBranches: boolean; branchIds: string[] } | null> {
  const assignment = await db.staffOrganizationAssignment.findFirst({
    where: {
      staffUserProfileId,
      organizationId,
      revokedAt: null,
      startsAt: { lte: new Date() },
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      AND: [{ OR: [{ statusId: null }, { status: { code: "ACTIVE" } }] }],
    },
    select: {
      id: true,
      scopeType: { select: { code: true } },
      branchScopes: { select: { branchId: true } },
    },
    orderBy: { assignedAt: "asc" },
  });
  if (!assignment) return null;
  return {
    assignmentId: assignment.id,
    allBranches:
      !assignment.scopeType || assignment.scopeType.code === "ALL_CURRENT_AND_FUTURE",
    branchIds: assignment.branchScopes.map((scope) => scope.branchId),
  };
}

/** True if the platform role set is portfolio-capable (sales/account mgmt or role-assign capable). */
function hasPortfolioCapableRole(platformRoles: string[]): boolean {
  if (
    platformRoles.includes(MASTER.platformRole.SALES) ||
    platformRoles.includes(MASTER.platformRole.ACCOUNT_MANAGER)
  ) {
    return true;
  }
  return permissionsForRoles({
    platformRoles,
    organizationRoles: [],
  }).includes(PLATFORM_PERMISSIONS.roleAssign);
}

/**
 * SUPER_ADMIN can manage any customer organization. Otherwise, a staff
 * member can manage a customer organization only if they hold a
 * portfolio-capable platform role AND the organization is actively assigned
 * to them via staff_organization_assignments.
 */
export function canManageCustomerOrganization(
  actor: PortfolioActor,
  organizationId: string,
): boolean {
  if (actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) {
    return true;
  }
  if (!hasPortfolioCapableRole(actor.platformRoles)) {
    return false;
  }
  return actor.managedOrganizationIds.includes(organizationId);
}

export function assertCanManageCustomerOrganization(
  actor: PortfolioActor,
  organizationId: string,
): void {
  if (!canManageCustomerOrganization(actor, organizationId)) {
    throw new CustomerPortfolioError("FORBIDDEN", TH.common.forbidden);
  }
}

/** Only SUPER_ADMIN (or a role granted platform.customer_portfolio.manage) may assign/revoke portfolios. */
export function canManagePortfolioAssignments(actor: {
  platformRoles: string[];
  permissionCodes?: string[];
}): boolean {
  const permissions = actor.permissionCodes ?? permissionsForRoles({
      platformRoles: actor.platformRoles,
      organizationRoles: [],
    });
  return permissions.includes(PLATFORM_PERMISSIONS.customerAssignmentManage) ||
    permissions.includes(PLATFORM_PERMISSIONS.customerPortfolioManage);
}

export function canTransferPortfolioAssignments(actor: {
  platformRoles: string[];
  permissionCodes?: string[];
}): boolean {
  const permissions = actor.permissionCodes ?? permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: [],
  });
  return permissions.includes(PLATFORM_PERMISSIONS.customerAssignmentTransfer);
}

export function assertCanManagePortfolioAssignments(actor: {
  platformRoles: string[];
}): void {
  if (!canManagePortfolioAssignments(actor)) {
    throw new CustomerPortfolioError("FORBIDDEN", TH.common.forbidden);
  }
}

export async function listStaffOrganizationAssignments(
  db: PrismaClient,
  filters: { staffUserProfileId?: string; organizationId?: string } = {},
) {
  return db.staffOrganizationAssignment.findMany({
    where: {
      staffUserProfileId: filters.staffUserProfileId,
      organizationId: filters.organizationId,
    },
    select: {
      id: true,
      staffUserProfileId: true,
      organizationId: true,
      assignedAt: true,
      revokedAt: true,
      note: true,
      assignmentRole: { select: { code: true, nameTh: true } },
      scopeType: { select: { code: true, nameTh: true } },
      status: { select: { code: true, nameTh: true } },
      branchScopes: { select: { branchId: true, branch: { select: { name: true, code: true } } } },
      staffUserProfile: {
        select: { id: true, displayName: true, email: true },
      },
      organization: {
        select: { id: true, displayName: true, customerCode: true },
      },
    },
    orderBy: [{ revokedAt: "asc" }, { assignedAt: "desc" }],
    take: 500,
  });
}

export async function assignStaffToOrganization(
  db: PrismaClient,
  input: {
    actor: { authUserId: string; profileId?: string | null; platformRoles: string[]; permissionCodes?: string[] };
    staffUserProfileId: string;
    organizationId: string;
    note?: string | null;
    assignmentRoleCode?: "CO_OWNER" | "SUPPORT";
    scopeTypeCode?: "ALL_CURRENT_AND_FUTURE" | "SELECTED_BRANCHES";
    branchIds?: string[];
  },
) {
  assertCanManagePortfolioAssignments(input.actor);

  if (input.actor.profileId === input.staffUserProfileId) {
    throw new CustomerPortfolioError(
      "FORBIDDEN",
      "ไม่สามารถเพิ่มองค์กรที่รับผิดชอบให้ตนเองได้",
    );
  }

  const [staff, organization] = await Promise.all([
    db.userProfile.findUnique({
      where: { id: input.staffUserProfileId },
      select: { id: true, deletedAt: true },
    }),
    db.organization.findFirst({
      where: { id: input.organizationId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (!staff || staff.deletedAt || !organization) {
    throw new CustomerPortfolioError("NOT_FOUND", TH.common.notFound);
  }

  const existingActive = await db.staffOrganizationAssignment.findFirst({
    where: {
      staffUserProfileId: input.staffUserProfileId,
      organizationId: input.organizationId,
      revokedAt: null,
    },
  });
  if (existingActive) {
    throw new CustomerPortfolioError(
      "CONFLICT",
      TH.staffPortfolio.alreadyAssigned,
    );
  }

  return db.$transaction(async (tx) => {
    return createStaffOrganizationAssignment(tx, {
      staffUserProfileId: input.staffUserProfileId,
      organizationId: input.organizationId,
      assignedByAuthUserId: input.actor.authUserId,
      note: input.note?.trim() || null,
      autoAssigned: false,
      assignmentRoleCode: input.assignmentRoleCode ?? "SUPPORT",
      scopeTypeCode: input.scopeTypeCode ?? "ALL_CURRENT_AND_FUTURE",
      branchIds: input.branchIds,
    });
  });
}

/**
 * Bind a staff profile to a customer org (used by Super Admin assign UI and
 * auto-bind when SALES/ACCOUNT_MANAGER creates an organization).
 */
export async function createStaffOrganizationAssignment(
  db: Db,
  input: {
    staffUserProfileId: string;
    organizationId: string;
    assignedByAuthUserId: string;
    note?: string | null;
    autoAssigned?: boolean;
    assignmentRoleCode?: "PRIMARY" | "CO_OWNER" | "SUPPORT";
    scopeTypeCode?: "ALL_CURRENT_AND_FUTURE" | "SELECTED_BRANCHES";
    branchIds?: string[];
  },
) {
  const assignmentRoleCode = input.assignmentRoleCode ?? (input.autoAssigned ? "PRIMARY" : "SUPPORT");
  const scopeTypeCode = input.scopeTypeCode ?? "ALL_CURRENT_AND_FUTURE";
  if (scopeTypeCode === "SELECTED_BRANCHES") {
    const branchIds = [...new Set(input.branchIds ?? [])];
    if (branchIds.length === 0) {
      throw new CustomerPortfolioError("VALIDATION", "กรุณาเลือกสาขาอย่างน้อยหนึ่งสาขา");
    }
    const validBranchCount = await db.branch.count({
      where: { id: { in: branchIds }, organizationId: input.organizationId, deletedAt: null },
    });
    if (validBranchCount !== branchIds.length) {
      throw new CustomerPortfolioError("FORBIDDEN", "พบสาขาที่ไม่อยู่ในองค์กรเป้าหมาย");
    }
  }
  const [assignmentRole, scopeType, status] = await Promise.all([
    db.customerAssignmentRole.upsert({
      where: { code: assignmentRoleCode },
      create: { code: assignmentRoleCode, nameTh: assignmentRoleCode === "PRIMARY" ? "ผู้รับผิดชอบหลัก" : assignmentRoleCode === "CO_OWNER" ? "ผู้รับผิดชอบร่วม" : "ทีม Support", nameEn: assignmentRoleCode, isSystem: true },
      update: {},
    }),
    db.customerAssignmentScopeType.upsert({
      where: { code: scopeTypeCode },
      create: { code: scopeTypeCode, nameTh: scopeTypeCode === "ALL_CURRENT_AND_FUTURE" ? "ทุกสาขาปัจจุบันและอนาคต" : "เฉพาะสาขาที่เลือก", nameEn: scopeTypeCode, isSystem: true },
      update: {},
    }),
    db.customerAssignmentStatus.upsert({
      where: { code: "ACTIVE" },
      create: { code: "ACTIVE", nameTh: "ใช้งาน", nameEn: "Active", isSystem: true },
      update: {},
    }),
  ]);
  const created = await db.staffOrganizationAssignment.create({
    data: {
      staffUserProfileId: input.staffUserProfileId,
      organizationId: input.organizationId,
      assignedByAuthUserId: input.assignedByAuthUserId,
      note: input.note?.trim() || null,
      assignmentRoleId: assignmentRole.id,
      scopeTypeId: scopeType.id,
      statusId: status.id,
      startsAt: new Date(),
      branchScopes: scopeTypeCode === "SELECTED_BRANCHES" && input.branchIds?.length
        ? {
            create: [...new Set(input.branchIds)].map((branchId) => ({
              branchId,
              assignedByAuthUserId: input.assignedByAuthUserId,
            })),
          }
        : undefined,
    },
  });
  await writeAuditLog(db, {
    organizationId: input.organizationId,
    actorAuthUserId: input.assignedByAuthUserId,
    actionCode: MASTER.auditActionType.STAFF_PORTFOLIO_ASSIGN,
    entityType: "staff_organization_assignment",
    entityId: created.id,
    after: {
      staffUserProfileId: input.staffUserProfileId,
      organizationId: input.organizationId,
      autoAssigned: input.autoAssigned === true,
      assignmentRole: assignmentRoleCode,
      branchScope: scopeTypeCode,
    },
  });
  return created;
}

export async function revokeStaffOrganizationAssignment(
  db: PrismaClient,
  input: {
    actor: { authUserId: string; profileId?: string | null; platformRoles: string[]; permissionCodes?: string[] };
    assignmentId: string;
  },
) {
  assertCanManagePortfolioAssignments(input.actor);

  const existing = await db.staffOrganizationAssignment.findUnique({
    where: { id: input.assignmentId },
  });
  if (!existing || existing.revokedAt) {
    throw new CustomerPortfolioError("NOT_FOUND", TH.common.notFound);
  }
  if (input.actor.profileId === existing.staffUserProfileId) {
    throw new CustomerPortfolioError("FORBIDDEN", "ไม่สามารถถอนตนเองออกจากองค์กรที่รับผิดชอบได้");
  }

  return db.$transaction(async (tx) => {
    const updated = await tx.staffOrganizationAssignment.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    await writeAuditLog(tx, {
      organizationId: existing.organizationId,
      actorAuthUserId: input.actor.authUserId,
      actionCode: MASTER.auditActionType.STAFF_PORTFOLIO_REVOKE,
      entityType: "staff_organization_assignment",
      entityId: existing.id,
      before: {
        staffUserProfileId: existing.staffUserProfileId,
        organizationId: existing.organizationId,
      },
    });
    return updated;
  });
}

export async function transferPrimaryStaffOrganizationAssignment(
  db: PrismaClient,
  input: {
    actor: { authUserId: string; profileId?: string | null; platformRoles: string[]; permissionCodes?: string[] };
    assignmentId: string;
    targetStaffUserProfileId: string;
    note?: string | null;
  },
) {
  if (!canTransferPortfolioAssignments(input.actor)) {
    throw new CustomerPortfolioError("FORBIDDEN", TH.common.forbidden);
  }
  if (input.actor.profileId === input.targetStaffUserProfileId) {
    throw new CustomerPortfolioError("FORBIDDEN", "ไม่สามารถโอนองค์กรให้ตนเองได้");
  }
  const existing = await db.staffOrganizationAssignment.findUnique({
    where: { id: input.assignmentId },
  });
  if (!existing || existing.revokedAt) {
    throw new CustomerPortfolioError("NOT_FOUND", TH.common.notFound);
  }
  if (input.actor.profileId === existing.staffUserProfileId) {
    throw new CustomerPortfolioError("FORBIDDEN", "ผู้รับผิดชอบไม่สามารถโอนองค์กรที่ตนรับผิดชอบได้");
  }
  const target = await db.userProfile.findFirst({
    where: { id: input.targetStaffUserProfileId, deletedAt: null },
    select: { id: true },
  });
  if (!target) throw new CustomerPortfolioError("NOT_FOUND", TH.common.notFound);

  return db.$transaction(async (tx) => {
    const revoked = await tx.staffOrganizationAssignment.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    const created = await createStaffOrganizationAssignment(tx, {
      staffUserProfileId: target.id,
      organizationId: existing.organizationId,
      assignedByAuthUserId: input.actor.authUserId,
      note: input.note?.trim() || "โอนผู้รับผิดชอบหลัก",
    });
    await writeAuditLog(tx, {
      organizationId: existing.organizationId,
      actorAuthUserId: input.actor.authUserId,
      actionCode: "customer_assignment.transfer",
      entityType: "staff_organization_assignment",
      entityId: created.id,
      before: { assignmentId: revoked.id, staffUserProfileId: existing.staffUserProfileId },
      after: { assignmentId: created.id, staffUserProfileId: target.id },
    });
    return { revoked, created };
  });
}
