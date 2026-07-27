import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import type { StaffAuthPort } from "@/lib/auth/staff-auth-adapter";
import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  type ActorAccess,
  canManageOrganization,
  OrganizationAdminError,
} from "@/lib/platform/organizations-admin";
import {
  cancelPasswordResetWindow,
  openPasswordResetWindow,
  StaffAdminError,
} from "@/lib/platform/staff";
import {
  provisionOrganizationUserDirect,
  UserInvitationError,
} from "@/lib/platform/user-invitations";

const CONTACT_ROLE_CODES = [
  MASTER.organizationRole.OWNER,
  MASTER.organizationRole.ADMIN,
] as const;

export type OrganizationAdminContact = {
  userProfileId: string;
  email: string;
  displayName: string;
  phone: string | null;
  membershipId: string;
  roleCodes: string[];
  statusCode: string;
  openPasswordReset: { id: string; expiresAt: Date } | null;
};

export function assertCanManageOrganizationAdmins(
  actor: ActorAccess,
  organizationId: string,
): void {
  if (!canManageOrganization(actor, organizationId)) {
    throw new OrganizationAdminError("FORBIDDEN", TH.common.forbidden);
  }
}

export async function listOrganizationAdminContacts(
  db: PrismaClient,
  organizationId: string,
): Promise<OrganizationAdminContact[]> {
  const now = new Date();
  const memberships = await db.organizationMembership.findMany({
    where: {
      organizationId,
      endedAt: null,
      userProfile: { deletedAt: null },
      roles: {
        some: {
          revokedAt: null,
          role: { code: { in: [...CONTACT_ROLE_CODES] } },
          status: { code: MASTER.assignmentStatus.ACTIVE },
        },
      },
    },
    select: {
      id: true,
      status: { select: { code: true } },
      userProfile: {
        select: {
          id: true,
          email: true,
          displayName: true,
          phone: true,
          passwordResets: {
            where: {
              consumedAt: null,
              cancelledAt: null,
              expiresAt: { gt: now },
            },
            select: { id: true, expiresAt: true },
            orderBy: { requestedAt: "desc" },
            take: 1,
          },
        },
      },
      roles: {
        where: {
          revokedAt: null,
          status: { code: MASTER.assignmentStatus.ACTIVE },
        },
        select: { role: { select: { code: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  return memberships.map((row) => ({
    userProfileId: row.userProfile.id,
    email: row.userProfile.email,
    displayName: row.userProfile.displayName,
    phone: row.userProfile.phone,
    membershipId: row.id,
    roleCodes: row.roles.map((r) => r.role.code),
    statusCode: row.status.code,
    openPasswordReset: row.userProfile.passwordResets[0] ?? null,
  }));
}

async function assertOrgMemberProfile(
  db: PrismaClient,
  organizationId: string,
  userProfileId: string,
) {
  const membership = await db.organizationMembership.findFirst({
    where: {
      organizationId,
      userProfileId,
      endedAt: null,
      userProfile: { deletedAt: null },
      roles: {
        some: {
          revokedAt: null,
          role: { code: { in: [...CONTACT_ROLE_CODES] } },
        },
      },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new OrganizationAdminError(
      "NOT_FOUND",
      "ไม่พบผู้ดูแลองค์กรคนนี้",
    );
  }
}

export async function requestOrganizationAdminPasswordReset(
  db: PrismaClient,
  input: {
    actor: ActorAccess;
    organizationId: string;
    userProfileId: string;
    auth: StaffAuthPort;
    note?: string | null;
  },
) {
  assertCanManageOrganizationAdmins(input.actor, input.organizationId);
  await assertOrgMemberProfile(
    db,
    input.organizationId,
    input.userProfileId,
  );

  try {
    return await openPasswordResetWindow(db, {
      actorAuthUserId: input.actor.authUserId,
      auth: input.auth,
      userProfileId: input.userProfileId,
      note:
        input.note?.trim() ||
        "รีเซ็ตรหัสผ่านผู้ดูแลจากหน้ารายละเอียดองค์กร",
    });
  } catch (error) {
    if (error instanceof StaffAdminError) {
      throw new OrganizationAdminError(
        error.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION",
        error.message,
      );
    }
    throw error;
  }
}

export async function cancelOrganizationAdminPasswordReset(
  db: PrismaClient,
  input: {
    actor: ActorAccess;
    organizationId: string;
    userProfileId: string;
    resetId: string;
  },
) {
  assertCanManageOrganizationAdmins(input.actor, input.organizationId);
  await assertOrgMemberProfile(
    db,
    input.organizationId,
    input.userProfileId,
  );

  try {
    return await cancelPasswordResetWindow(db, {
      actorAuthUserId: input.actor.authUserId,
      userProfileId: input.userProfileId,
      resetId: input.resetId,
    });
  } catch (error) {
    if (error instanceof StaffAdminError) {
      throw new OrganizationAdminError(
        error.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION",
        error.message,
      );
    }
    throw error;
  }
}

export const addOrganizationAdminSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(200)
    .transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(1).max(120),
  /** Defaults to ADMIN — the usual customer-org contact role. */
  roleCode: z.enum(["OWNER", "ADMIN"]).default("ADMIN"),
});

/**
 * Add (or re-attach) an org ADMIN/OWNER who can log in immediately.
 * New accounts get a first-login password-reset window.
 * Existing accounts are attached as members; password is left alone unless reset separately.
 */
type InviteActor = ActorAccess & {
  organizationRoles: string[];
  organizationRolesByOrganization: Record<string, string[]>;
};

export async function addOrganizationAdminContact(
  db: PrismaClient,
  input: {
    actor: InviteActor;
    organizationId: string;
    payload: unknown;
    auth?: StaffAuthPort;
  },
) {
  assertCanManageOrganizationAdmins(input.actor, input.organizationId);
  const payload = addOrganizationAdminSchema.parse(input.payload);

  const existing = await db.userProfile.findFirst({
    where: { email: payload.email, deletedAt: null },
    select: { id: true, authUserId: true, displayName: true },
  });

  if (existing) {
    const membershipActive = await db.membershipStatus.findUniqueOrThrow({
      where: { code: MASTER.membershipStatus.ACTIVE },
    });
    const assignmentActive = await db.assignmentStatus.findUniqueOrThrow({
      where: { code: MASTER.assignmentStatus.ACTIVE },
    });
    const role = await db.organizationRole.findFirstOrThrow({
      where: {
        code: payload.roleCode,
        organizationId: null,
        isSystem: true,
      },
      select: { id: true },
    });
    const allBranches = await db.branchScopeType.findUniqueOrThrow({
      where: { code: MASTER.branchScopeType.ALL_BRANCHES },
      select: { id: true },
    });

    const result = await db.$transaction(async (tx) => {
      const membership =
        (await tx.organizationMembership.findUnique({
          where: {
            organizationId_userProfileId: {
              organizationId: input.organizationId,
              userProfileId: existing.id,
            },
          },
        })) ??
        (await tx.organizationMembership.create({
          data: {
            organizationId: input.organizationId,
            userProfileId: existing.id,
            statusId: membershipActive.id,
            joinedAt: new Date(),
            invitedByAuthUserId: input.actor.authUserId,
          },
        }));

      if (membership.endedAt || membership.statusId !== membershipActive.id) {
        await tx.organizationMembership.update({
          where: { id: membership.id },
          data: {
            endedAt: null,
            statusId: membershipActive.id,
            joinedAt: membership.joinedAt ?? new Date(),
          },
        });
      }

      const hasRole = await tx.organizationMembershipRole.findFirst({
        where: {
          membershipId: membership.id,
          roleId: role.id,
          revokedAt: null,
        },
        select: { id: true },
      });
      if (!hasRole) {
        await tx.organizationMembershipRole.create({
          data: {
            membershipId: membership.id,
            roleId: role.id,
            statusId: assignmentActive.id,
          },
        });
      }

      const hasScope = await tx.organizationMembershipBranchScope.findFirst({
        where: {
          membershipId: membership.id,
          scopeTypeId: allBranches.id,
          branchId: null,
        },
        select: { id: true },
      });
      if (!hasScope) {
        await tx.organizationMembershipBranchScope.create({
          data: {
            membershipId: membership.id,
            scopeTypeId: allBranches.id,
            statusId: assignmentActive.id,
          },
        });
      }

      return {
        profileId: existing.id,
        membershipId: membership.id,
        reused: true as const,
        passwordResetId: null as string | null,
        loginEmail: payload.email,
      };
    });

    return result;
  }

  try {
    const provisioned = await provisionOrganizationUserDirect(
      db,
      input.actor,
      {
        email: payload.email,
        phone: null,
        displayName: payload.displayName,
        organizationId: input.organizationId,
        organizationRoleCode: payload.roleCode,
        branchScope: "ALL_BRANCHES",
        branchIds: [],
        idempotencyKey: crypto.randomUUID(),
      },
      input.auth,
    );
    return {
      profileId: provisioned.profileId,
      membershipId: provisioned.membershipId,
      reused: false as const,
      passwordResetId: provisioned.passwordResetId ?? null,
      loginEmail: provisioned.loginEmail ?? payload.email,
    };
  } catch (error) {
    if (error instanceof UserInvitationError) {
      throw new OrganizationAdminError(
        error.code === "FORBIDDEN" ? "FORBIDDEN" : "VALIDATION",
        error.message,
      );
    }
    throw error;
  }
}
