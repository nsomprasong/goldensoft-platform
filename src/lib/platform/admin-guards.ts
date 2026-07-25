import type { Prisma, PrismaClient } from "@prisma/client";

import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";

type Db = PrismaClient | Prisma.TransactionClient;

export class AdminGuardError extends Error {
  readonly code:
    | "LAST_SUPER_ADMIN"
    | "LAST_OWNER"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT";

  constructor(
    code: AdminGuardError["code"],
    message: string = TH.roles.lastAdmin,
  ) {
    super(message);
    this.name = "AdminGuardError";
    this.code = code;
  }
}

export async function countActiveSuperAdmins(db: Db): Promise<number> {
  const assignmentActive = await db.assignmentStatus.findUnique({
    where: { code: MASTER.assignmentStatus.ACTIVE },
  });
  const profileActive = await db.userProfileStatus.findUnique({
    where: { code: MASTER.userProfileStatus.ACTIVE },
  });
  const superRole = await db.platformRole.findUnique({
    where: { code: MASTER.platformRole.SUPER_ADMIN },
  });
  if (!assignmentActive || !profileActive || !superRole) return 0;

  return db.platformRoleAssignment.count({
    where: {
      roleId: superRole.id,
      statusId: assignmentActive.id,
      revokedAt: null,
      userProfile: { statusId: profileActive.id, deletedAt: null },
    },
  });
}

export async function countActiveOwners(
  db: Db,
  organizationId: string,
): Promise<number> {
  const assignmentActive = await db.assignmentStatus.findUnique({
    where: { code: MASTER.assignmentStatus.ACTIVE },
  });
  const membershipActive = await db.membershipStatus.findUnique({
    where: { code: MASTER.membershipStatus.ACTIVE },
  });
  const ownerRole = await db.organizationRole.findFirst({
    where: {
      code: MASTER.organizationRole.OWNER,
      organizationId: null,
      isSystem: true,
    },
  });
  if (!assignmentActive || !membershipActive || !ownerRole) return 0;

  return db.organizationMembershipRole.count({
    where: {
      roleId: ownerRole.id,
      statusId: assignmentActive.id,
      revokedAt: null,
      membership: {
        organizationId,
        statusId: membershipActive.id,
      },
    },
  });
}

export function wouldRemoveLastSuperAdmin(activeCount: number): boolean {
  return activeCount <= 1;
}

export function wouldRemoveLastOwner(activeOwnerCount: number): boolean {
  return activeOwnerCount <= 1;
}

export async function assertCanRemoveSuperAdmin(
  db: Db,
  userProfileId: string,
): Promise<void> {
  const assignmentActive = await db.assignmentStatus.findUnique({
    where: { code: MASTER.assignmentStatus.ACTIVE },
  });
  const superRole = await db.platformRole.findUnique({
    where: { code: MASTER.platformRole.SUPER_ADMIN },
  });
  if (!assignmentActive || !superRole) {
    throw new AdminGuardError("NOT_FOUND", TH.common.notFound);
  }

  const hasRole = await db.platformRoleAssignment.findFirst({
    where: {
      userProfileId,
      roleId: superRole.id,
      statusId: assignmentActive.id,
      revokedAt: null,
    },
  });
  if (!hasRole) return;

  const count = await countActiveSuperAdmins(db);
  if (wouldRemoveLastSuperAdmin(count)) {
    throw new AdminGuardError("LAST_SUPER_ADMIN", TH.roles.lastAdmin);
  }
}

export async function assertCanRemoveOwner(
  db: Db,
  organizationId: string,
  membershipId: string,
): Promise<void> {
  const assignmentActive = await db.assignmentStatus.findUnique({
    where: { code: MASTER.assignmentStatus.ACTIVE },
  });
  const ownerRole = await db.organizationRole.findFirst({
    where: {
      code: MASTER.organizationRole.OWNER,
      organizationId: null,
      isSystem: true,
    },
  });
  if (!assignmentActive || !ownerRole) {
    throw new AdminGuardError("NOT_FOUND", TH.common.notFound);
  }

  const hasOwner = await db.organizationMembershipRole.findFirst({
    where: {
      membershipId,
      roleId: ownerRole.id,
      statusId: assignmentActive.id,
      revokedAt: null,
    },
  });
  if (!hasOwner) return;

  const count = await countActiveOwners(db, organizationId);
  if (wouldRemoveLastOwner(count)) {
    throw new AdminGuardError("LAST_OWNER", TH.roles.lastOwner);
  }
}

/** ADMIN must not assign OWNER. BILLING_CONTACT must not invite. */
export function canAssignOrganizationRole(input: {
  actorPlatformRoles: string[];
  actorOrganizationRoles: string[];
  targetRole: string;
}): boolean {
  if (input.actorPlatformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) {
    return true;
  }
  if (input.actorOrganizationRoles.includes(MASTER.organizationRole.OWNER)) {
    return ["OWNER", "ADMIN", "BILLING_CONTACT"].includes(input.targetRole);
  }
  if (input.actorOrganizationRoles.includes(MASTER.organizationRole.ADMIN)) {
    return ["ADMIN", "BILLING_CONTACT"].includes(input.targetRole);
  }
  return false;
}

export function canInviteUsers(input: {
  actorPlatformRoles: string[];
  actorOrganizationRoles: string[];
}): boolean {
  if (input.actorPlatformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) {
    return true;
  }
  if (input.actorPlatformRoles.includes(MASTER.platformRole.SUPPORT)) {
    return false;
  }
  if (
    input.actorOrganizationRoles.includes(MASTER.organizationRole.OWNER) ||
    input.actorOrganizationRoles.includes(MASTER.organizationRole.ADMIN)
  ) {
    return true;
  }
  return false;
}
