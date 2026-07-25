import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { PrismaClient } from "@prisma/client";

import { TH } from "@/lib/i18n/th";
import {
  AdminGuardError,
  canAssignOrganizationRole,
  canInviteUsers,
} from "@/lib/platform/admin-guards";
import { writeAuditLog } from "@/lib/platform/audit";
import { MASTER } from "@/lib/platform/master-codes";
import { requireActiveMasterId } from "@/lib/platform/master-data";
import type { ActorAccess } from "@/lib/platform/organizations-admin";

export class InviteError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "EMAIL_CONFLICT"
    | "ALREADY_MEMBER"
    | "PENDING_INVITE"
    | "ROLE_FORBIDDEN"
    | "VALIDATION";

  constructor(code: InviteError["code"], message: string) {
    super(message);
    this.name = "InviteError";
    this.code = code;
  }
}

export const inviteUserSchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1).max(200),
  organizationId: z.string().uuid(),
  organizationRole: z.enum(["OWNER", "ADMIN", "BILLING_CONTACT"]),
  branchScope: z.enum(["ALL_BRANCHES", "SELECTED", "NONE"]),
  branchIds: z.array(z.string().uuid()).default([]),
});

export type AuthInviteAdapter = {
  findUserByEmail: (
    email: string,
  ) => Promise<{ id: string; email: string } | null>;
  inviteUserByEmail: (input: {
    email: string;
    displayName: string;
  }) => Promise<{ id: string; email: string; invited: boolean; reused: boolean }>;
};

/**
 * In-memory mock Auth Admin adapter for Phase 5 verification.
 * Never talks to Supabase. Real adapter requires explicit approval.
 */
export function createMockAuthInviteAdapter(
  seed: Array<{ id: string; email: string }> = [],
): AuthInviteAdapter {
  const users = new Map(
    seed.map((u) => [u.email.toLowerCase(), { ...u, email: u.email.toLowerCase() }]),
  );

  return {
    async findUserByEmail(email) {
      return users.get(email.toLowerCase()) ?? null;
    },
    async inviteUserByEmail(input) {
      const key = input.email.toLowerCase();
      const existing = users.get(key);
      if (existing) {
        return { ...existing, invited: false, reused: true };
      }
      const created = { id: randomUUID(), email: key };
      users.set(key, created);
      return { ...created, invited: true, reused: false };
    },
  };
}

export async function inviteOrganizationUser(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles: string[] },
  input: z.infer<typeof inviteUserSchema>,
  auth: AuthInviteAdapter,
) {
  const parsed = inviteUserSchema.parse(input);
  const email = parsed.email.toLowerCase();

  if (
    !canInviteUsers({
      actorPlatformRoles: actor.platformRoles,
      actorOrganizationRoles: actor.organizationRoles,
    })
  ) {
    throw new InviteError("FORBIDDEN", TH.common.forbidden);
  }

  if (
    !actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) &&
    !actor.membershipOrganizationIds.includes(parsed.organizationId)
  ) {
    throw new InviteError("FORBIDDEN", TH.common.forbidden);
  }

  if (
    !canAssignOrganizationRole({
      actorPlatformRoles: actor.platformRoles,
      actorOrganizationRoles: actor.organizationRoles,
      targetRole: parsed.organizationRole,
    })
  ) {
    throw new InviteError(
      "ROLE_FORBIDDEN",
      "คุณไม่มีสิทธิ์กำหนดบทบาทนี้",
    );
  }

  if (
    parsed.branchScope === "SELECTED" &&
    parsed.branchIds.length === 0
  ) {
    throw new InviteError("VALIDATION", "ต้องเลือกสาขาอย่างน้อย 1 สาขา");
  }

  const org = await db.organization.findFirst({
    where: { id: parsed.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!org) throw new InviteError("NOT_FOUND", TH.common.notFound);

  if (parsed.branchIds.length > 0) {
    const branches = await db.branch.findMany({
      where: {
        id: { in: parsed.branchIds },
        organizationId: parsed.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (branches.length !== parsed.branchIds.length) {
      throw new InviteError("FORBIDDEN", TH.common.forbidden);
    }
  }

  const existingProfile = await db.userProfile.findUnique({
    where: { email },
  });

  const authUser = await auth.inviteUserByEmail({
    email,
    displayName: parsed.displayName,
  });

  if (
    existingProfile &&
    existingProfile.authUserId !== authUser.id
  ) {
    throw new InviteError("EMAIL_CONFLICT", TH.users.emailInOtherOrg);
  }

  return db.$transaction(async (tx) => {
    const profileActiveId = await requireActiveMasterId(
      tx,
      "userProfileStatus",
      MASTER.userProfileStatus.ACTIVE,
    );
    const membershipInvitedId = await requireActiveMasterId(
      tx,
      "membershipStatus",
      MASTER.membershipStatus.INVITED,
    );
    const membershipActiveId = await requireActiveMasterId(
      tx,
      "membershipStatus",
      MASTER.membershipStatus.ACTIVE,
    );
    const assignmentActiveId = await requireActiveMasterId(
      tx,
      "assignmentStatus",
      MASTER.assignmentStatus.ACTIVE,
    );
    const orgRole = await tx.organizationRole.findFirst({
      where: {
        code: parsed.organizationRole,
        OR: [
          { organizationId: null, isSystem: true },
          { organizationId: parsed.organizationId, isActive: true },
        ],
      },
    });
    if (!orgRole) throw new InviteError("NOT_FOUND", TH.common.notFound);
    const scopeType = await tx.branchScopeType.findUnique({
      where: { code: parsed.branchScope },
    });
    if (!scopeType) throw new InviteError("NOT_FOUND", TH.common.notFound);

    let profile =
      existingProfile ??
      (await tx.userProfile.findUnique({ where: { authUserId: authUser.id } }));

    if (!profile) {
      profile = await tx.userProfile.create({
        data: {
          authUserId: authUser.id,
          email,
          displayName: parsed.displayName,
          statusId: profileActiveId,
        },
      });
    } else if (profile.email !== email) {
      throw new InviteError("EMAIL_CONFLICT", TH.users.exists);
    }

    const existingMembership = await tx.organizationMembership.findUnique({
      where: {
        organizationId_userProfileId: {
          organizationId: parsed.organizationId,
          userProfileId: profile.id,
        },
      },
      include: { status: true },
    });

    if (existingMembership) {
      if (existingMembership.status.code === MASTER.membershipStatus.ACTIVE) {
        throw new InviteError("ALREADY_MEMBER", TH.users.exists);
      }
      if (existingMembership.status.code === MASTER.membershipStatus.INVITED) {
        throw new InviteError("PENDING_INVITE", TH.users.pendingInvite);
      }
    }

    const membership =
      existingMembership ??
      (await tx.organizationMembership.create({
        data: {
          organizationId: parsed.organizationId,
          userProfileId: profile.id,
          statusId: membershipInvitedId,
          invitedByAuthUserId: actor.authUserId,
        },
      }));

    if (existingMembership) {
      await tx.organizationMembership.update({
        where: { id: membership.id },
        data: {
          statusId: membershipInvitedId,
          invitedByAuthUserId: actor.authUserId,
          endedAt: null,
        },
      });
    }

    const existingRole = await tx.organizationMembershipRole.findFirst({
      where: {
        membershipId: membership.id,
        roleId: orgRole.id,
        statusId: assignmentActiveId,
        revokedAt: null,
      },
    });
    if (!existingRole) {
      await tx.organizationMembershipRole.create({
        data: {
          membershipId: membership.id,
          roleId: orgRole.id,
          statusId: assignmentActiveId,
        },
      });
    }

    const existingScopes = await tx.organizationMembershipBranchScope.findMany({
      where: {
        membershipId: membership.id,
        statusId: assignmentActiveId,
      },
    });
    if (existingScopes.length === 0) {
      if (parsed.branchScope === "SELECTED") {
        for (const branchId of parsed.branchIds) {
          await tx.organizationMembershipBranchScope.create({
            data: {
              membershipId: membership.id,
              scopeTypeId: scopeType.id,
              branchId,
              statusId: assignmentActiveId,
            },
          });
        }
      } else {
        await tx.organizationMembershipBranchScope.create({
          data: {
            membershipId: membership.id,
            scopeTypeId: scopeType.id,
            branchId: null,
            statusId: assignmentActiveId,
          },
        });
      }
    }

    await writeAuditLog(tx, {
      organizationId: parsed.organizationId,
      actorAuthUserId: actor.authUserId,
      actionCode: authUser.reused
        ? MASTER.auditActionType.USER_REINVITE
        : MASTER.auditActionType.USER_INVITE,
      entityType: "UserProfile",
      entityId: profile.id,
      after: {
        emailMasked: maskEmail(email),
        organizationRole: parsed.organizationRole,
        branchScope: parsed.branchScope,
        membershipStatus: MASTER.membershipStatus.INVITED,
        authReused: authUser.reused,
      },
    });

    await writeAuditLog(tx, {
      organizationId: parsed.organizationId,
      actorAuthUserId: actor.authUserId,
      actionCode: MASTER.auditActionType.MEMBERSHIP_CREATE,
      entityType: "OrganizationMembership",
      entityId: membership.id,
      after: {
        userProfileId: profile.id,
        status: MASTER.membershipStatus.INVITED,
      },
    });

    // silence unused in transaction path
    void membershipActiveId;

    return {
      profileId: profile.id,
      membershipId: membership.id,
      authUserId: authUser.id,
      invited: authUser.invited,
      reused: authUser.reused,
    };
  });
}

export async function reinviteOrganizationUser(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles: string[] },
  membershipId: string,
  auth: AuthInviteAdapter,
) {
  if (
    !canInviteUsers({
      actorPlatformRoles: actor.platformRoles,
      actorOrganizationRoles: actor.organizationRoles,
    })
  ) {
    throw new InviteError("FORBIDDEN", TH.common.forbidden);
  }

  const membership = await db.organizationMembership.findUnique({
    where: { id: membershipId },
    select: {
      id: true,
      organizationId: true,
      status: { select: { code: true } },
      userProfile: {
        select: { email: true, displayName: true },
      },
    },
  });
  if (!membership) throw new InviteError("NOT_FOUND", TH.common.notFound);

  if (
    !actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) &&
    !actor.membershipOrganizationIds.includes(membership.organizationId)
  ) {
    throw new InviteError("FORBIDDEN", TH.common.forbidden);
  }

  if (membership.status.code !== MASTER.membershipStatus.INVITED) {
    throw new InviteError("VALIDATION", TH.users.exists);
  }

  await auth.inviteUserByEmail({
    email: membership.userProfile.email,
    displayName: membership.userProfile.displayName,
  });

  await writeAuditLog(db, {
    organizationId: membership.organizationId,
    actorAuthUserId: actor.authUserId,
    actionCode: MASTER.auditActionType.USER_REINVITE,
    entityType: "OrganizationMembership",
    entityId: membership.id,
    after: { emailMasked: maskEmail(membership.userProfile.email) },
  });

  return { ok: true as const };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || !local) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

export { AdminGuardError };
