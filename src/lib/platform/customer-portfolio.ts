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
  platformRoles: string[];
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
}): boolean {
  return permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: [],
  }).includes(PLATFORM_PERMISSIONS.customerPortfolioManage);
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
    actor: { authUserId: string; platformRoles: string[] };
    staffUserProfileId: string;
    organizationId: string;
    note?: string | null;
  },
) {
  assertCanManagePortfolioAssignments(input.actor);

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
  },
) {
  const created = await db.staffOrganizationAssignment.create({
    data: {
      staffUserProfileId: input.staffUserProfileId,
      organizationId: input.organizationId,
      assignedByAuthUserId: input.assignedByAuthUserId,
      note: input.note?.trim() || null,
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
    },
  });
  return created;
}

export async function revokeStaffOrganizationAssignment(
  db: PrismaClient,
  input: {
    actor: { authUserId: string; platformRoles: string[] };
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
