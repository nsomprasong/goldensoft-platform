import { z } from "zod";

import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  AuthInviteAdapter,
  AuthInviteResult,
} from "@/lib/auth/auth-invite-adapter";
import { AuthInviteError } from "@/lib/auth/auth-invite-adapter";
import { TH } from "@/lib/i18n/th";
import {
  canAssignOrganizationRole,
  canInviteUsers,
} from "@/lib/platform/admin-guards";
import { writeAuditLog } from "@/lib/platform/audit";
import { MASTER } from "@/lib/platform/master-codes";
import type { ActorAccess } from "@/lib/platform/organizations-admin";

type Actor = ActorAccess & {
  organizationRoles: string[];
  organizationRolesByOrganization: Record<string, string[]>;
};
type Db = PrismaClient | Prisma.TransactionClient;

const MAX_INVITE_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

export const realInviteUserSchema = z
  .object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    displayName: z.string().trim().min(1).max(200),
    organizationId: z.string().uuid(),
    organizationRoleCode: z.enum(["OWNER", "ADMIN", "BILLING_CONTACT"]),
    branchScope: z.enum(["ALL_BRANCHES", "SELECTED", "NONE"]),
    branchIds: z.array(z.string().uuid()).max(200).default([]),
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((value, context) => {
    if (value.branchScope === "SELECTED" && value.branchIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["branchIds"],
        message: "ต้องเลือกสาขาอย่างน้อย 1 สาขา",
      });
    }
    if (value.branchScope !== "SELECTED" && value.branchIds.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["branchIds"],
        message: "ห้ามส่งรหัสสาขาเมื่อไม่ได้เลือกขอบเขตบางสาขา",
      });
    }
  });

export class UserInvitationError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "ROLE_FORBIDDEN"
      | "EMAIL_CONFLICT"
      | "ALREADY_ACTIVE"
      | "INVITE_NOT_READY"
      | "RATE_LIMITED"
      | "MAX_ATTEMPTS"
      | "IDEMPOTENCY_CONFLICT"
      | "PLATFORM_SETUP_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "UserInvitationError";
  }
}

export type InviteOrganizationUserResult = {
  invitationId: string;
  profileId: string | null;
  membershipId: string | null;
  invited: boolean;
  reused: boolean;
  status: string;
};

function assertInvitePermission(actor: Actor, organizationId: string, role: string) {
  if (!canInviteOrganizationUser(actor, organizationId, role)) {
    throw new UserInvitationError("FORBIDDEN", TH.common.forbidden);
  }
}

export function canInviteOrganizationUser(
  actor: Actor,
  organizationId: string,
  role: string,
): boolean {
  const targetOrganizationRoles =
    actor.organizationRolesByOrganization[organizationId] ?? [];
  if (
    !canInviteUsers({
      actorPlatformRoles: actor.platformRoles,
      actorOrganizationRoles: targetOrganizationRoles,
    })
  ) {
    return false;
  }
  if (
    !actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) &&
    !actor.membershipOrganizationIds.includes(organizationId)
  ) {
    return false;
  }
  if (
    !canAssignOrganizationRole({
      actorPlatformRoles: actor.platformRoles,
      actorOrganizationRoles: targetOrganizationRoles,
      targetRole: role,
    })
  ) {
    return false;
  }
  return true;
}

async function resolveInviteMasters(
  db: Db,
  input: z.infer<typeof realInviteUserSchema> & { actorAuthUserId: string },
) {
  const [organization, role, scope, pending, inviter] = await Promise.all([
    db.organization.findFirst({
      where: { id: input.organizationId, deletedAt: null },
      select: { id: true },
    }),
    db.organizationRole.findUnique({
      where: { code: input.organizationRoleCode },
      select: { id: true },
    }),
    db.branchScopeType.findUnique({
      where: { code: input.branchScope },
      select: { id: true },
    }),
    db.userInvitationStatus.findUnique({
      where: { code: MASTER.userInvitationStatus.PENDING },
      select: { id: true },
    }),
    db.userProfile.findUnique({
      where: { authUserId: input.actorAuthUserId },
      select: { id: true },
    }),
  ]);
  if (!organization || !role || !scope || !pending || !inviter) {
    throw new UserInvitationError("NOT_FOUND", TH.common.notFound);
  }
  if (input.branchIds.length > 0) {
    const count = await db.branch.count({
      where: {
        id: { in: [...new Set(input.branchIds)] },
        organizationId: input.organizationId,
        deletedAt: null,
      },
    });
    if (count !== new Set(input.branchIds).size) {
      throw new UserInvitationError("FORBIDDEN", TH.common.forbidden);
    }
  }
  return { role, scope, pending, inviter };
}

export async function inviteOrganizationUserReal(
  db: PrismaClient,
  actor: Actor,
  rawInput: unknown,
  auth: AuthInviteAdapter,
  redirectTo: string,
): Promise<InviteOrganizationUserResult> {
  const input = realInviteUserSchema.parse(rawInput);
  assertInvitePermission(actor, input.organizationId, input.organizationRoleCode);
  const masters = await resolveInviteMasters(db, {
    ...input,
    actorAuthUserId: actor.authUserId,
  } as z.infer<typeof realInviteUserSchema> & { actorAuthUserId: string });

  const byKey = await db.userInvitation.findUnique({
    where: {
      organizationId_idempotencyKey: {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    include: { status: { select: { code: true } } },
  });
  if (byKey) {
    if (
      byKey.emailNormalized !== input.email ||
      byKey.organizationRoleId !== masters.role.id ||
      byKey.branchScopeTypeId !== masters.scope.id
    ) {
      throw new UserInvitationError(
        "IDEMPOTENCY_CONFLICT",
        "รหัสคำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว",
      );
    }
    if (
      byKey.status.code === MASTER.userInvitationStatus.AUTH_SENT ||
      byKey.status.code === MASTER.userInvitationStatus.COMPLETED
    ) {
      return {
        invitationId: byKey.id,
        profileId: null,
        membershipId: null,
        invited: false,
        reused: true,
        status: byKey.status.code,
      };
    }
  }

  const activeForEmail =
    byKey ??
    (await db.userInvitation.findFirst({
      where: {
        organizationId: input.organizationId,
        emailNormalized: input.email,
        isActive: true,
      },
      include: { status: { select: { code: true } } },
      orderBy: { createdAt: "desc" },
    }));
  if (
    activeForEmail &&
    activeForEmail.status.code === MASTER.userInvitationStatus.AUTH_SENT
  ) {
    return {
      invitationId: activeForEmail.id,
      profileId: null,
      membershipId: null,
      invited: false,
      reused: true,
      status: activeForEmail.status.code,
    };
  }

  const invitation =
    activeForEmail ??
    (await db.$transaction(async (tx) => {
      const created = await tx.userInvitation.create({
        data: {
          emailNormalized: input.email,
          displayName: input.displayName,
          organizationId: input.organizationId,
          organizationRoleId: masters.role.id,
          branchScopeTypeId: masters.scope.id,
          branchIdsJson: [...new Set(input.branchIds)],
          statusId: masters.pending.id,
          invitedByProfileId: masters.inviter.id,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await writeAuditLog(tx, {
        organizationId: input.organizationId,
        actorAuthUserId: actor.authUserId,
        actionCode: MASTER.auditActionType.USER_INVITE_REQUESTED,
        entityType: "UserInvitation",
        entityId: created.id,
        after: {
          emailMasked: maskEmail(input.email),
          organizationRoleCode: input.organizationRoleCode,
          branchScope: input.branchScope,
        },
      });
      return created;
    }));

  const claim = await db.userInvitation.updateMany({
    where: {
      id: invitation.id,
      OR: [
        { processingStartedAt: null },
        { processingStartedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
      ],
    },
    data: { processingStartedAt: new Date() },
  });
  if (claim.count === 0) {
    return {
      invitationId: invitation.id,
      profileId: null,
      membershipId: null,
      invited: false,
      reused: true,
      status:
        activeForEmail?.status.code ?? MASTER.userInvitationStatus.PENDING,
    };
  }

  let authResult: AuthInviteResult;
  try {
    const lookup = await auth.getUserByEmail(input.email);
    if (invitation.authUserId) {
      authResult = {
        authUserId: invitation.authUserId,
        email: input.email,
        invited: false,
        reused: true,
        emailConfirmed: lookup.found && lookup.emailConfirmed,
      };
    } else if (lookup.found && lookup.emailConfirmed) {
      authResult = {
        ...lookup,
        invited: false,
        reused: true,
      };
    } else if (lookup.found) {
      authResult = await auth.resendInvite({ email: input.email, redirectTo });
    } else {
      authResult = await auth.inviteUser({
        email: input.email,
        displayName: input.displayName,
        redirectTo,
      });
    }
  } catch (error) {
    const code =
      error instanceof AuthInviteError ? error.code : "AUTH_INVITE_FAILED";
    const failedId = await invitationStatusId(
      db,
      MASTER.userInvitationStatus.FAILED,
    );
    await db.$transaction(async (tx) => {
      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: {
          statusId: failedId,
          isActive: false,
          lastErrorCode: code,
          processingStartedAt: null,
          lastAttemptAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });
      await writeAuditLog(tx, {
        organizationId: input.organizationId,
        actorAuthUserId: actor.authUserId,
        actionCode: MASTER.auditActionType.USER_INVITE_FAILED,
        entityType: "UserInvitation",
        entityId: invitation.id,
        after: { errorCode: code, emailMasked: maskEmail(input.email) },
      });
    });
    throw error;
  }

  try {
    await db.userInvitation.update({
      where: { id: invitation.id },
      data: {
        authUserId: authResult.authUserId,
        authInviteSentAt: authResult.invited ? new Date() : undefined,
        lastAttemptAt: new Date(),
        attemptCount: { increment: authResult.invited ? 1 : 0 },
      },
    });
    return await completePlatformSetup(
      db,
      actor,
      input,
      invitation.id,
      authResult,
    );
  } catch {
    const failedId = await invitationStatusId(
      db,
      MASTER.userInvitationStatus.PLATFORM_SETUP_FAILED,
    );
    await db.$transaction(async (tx) => {
      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: {
          authUserId: authResult.authUserId,
          statusId: failedId,
          isActive: true,
          lastErrorCode: "PLATFORM_SETUP_FAILED",
          processingStartedAt: null,
          lastAttemptAt: new Date(),
        },
      });
      await writeAuditLog(tx, {
        organizationId: input.organizationId,
        actorAuthUserId: actor.authUserId,
        actionCode: MASTER.auditActionType.USER_PLATFORM_SETUP_FAILED,
        entityType: "UserInvitation",
        entityId: invitation.id,
        after: { errorCode: "PLATFORM_SETUP_FAILED" },
      });
    });
    throw new UserInvitationError(
      "PLATFORM_SETUP_FAILED",
      "ส่งคำเชิญแล้ว แต่จัดเตรียมสิทธิ์ไม่สำเร็จ กรุณาลองใหม่",
    );
  }
}

async function completePlatformSetup(
  db: PrismaClient,
  actor: Actor,
  input: z.infer<typeof realInviteUserSchema>,
  invitationId: string,
  authResult: AuthInviteResult,
): Promise<InviteOrganizationUserResult> {
  return db.$transaction(
    async (tx) => {
      const [profilePending, profileActive, membershipInvited, membershipActive, assignmentActive, authSent, completed, role, scope] =
        await Promise.all([
          tx.userProfileStatus.findUnique({ where: { code: MASTER.userProfileStatus.PENDING } }),
          tx.userProfileStatus.findUnique({ where: { code: MASTER.userProfileStatus.ACTIVE } }),
          tx.membershipStatus.findUnique({ where: { code: MASTER.membershipStatus.INVITED } }),
          tx.membershipStatus.findUnique({ where: { code: MASTER.membershipStatus.ACTIVE } }),
          tx.assignmentStatus.findUnique({ where: { code: MASTER.assignmentStatus.ACTIVE } }),
          tx.userInvitationStatus.findUnique({ where: { code: MASTER.userInvitationStatus.AUTH_SENT } }),
          tx.userInvitationStatus.findUnique({ where: { code: MASTER.userInvitationStatus.COMPLETED } }),
          tx.organizationRole.findUnique({ where: { code: input.organizationRoleCode } }),
          tx.branchScopeType.findUnique({ where: { code: input.branchScope } }),
        ]);
      if (
        !profilePending ||
        !profileActive ||
        !membershipInvited ||
        !membershipActive ||
        !assignmentActive ||
        !authSent ||
        !completed ||
        !role ||
        !scope
      ) {
        throw new Error("Invitation master data incomplete");
      }

      const byEmail = await tx.userProfile.findUnique({ where: { email: input.email } });
      const byAuth = await tx.userProfile.findUnique({
        where: { authUserId: authResult.authUserId },
      });
      if (
        (byEmail && byEmail.authUserId !== authResult.authUserId) ||
        (byAuth && byAuth.email.toLowerCase() !== input.email)
      ) {
        throw new UserInvitationError(
          "EMAIL_CONFLICT",
          "อีเมลหรือบัญชี Auth ขัดแย้งกับโปรไฟล์เดิม",
        );
      }
      const targetProfileStatus = authResult.emailConfirmed
        ? profileActive.id
        : profilePending.id;
      const profile =
        byEmail ??
        byAuth ??
        (await tx.userProfile.create({
          data: {
            authUserId: authResult.authUserId,
            email: input.email,
            displayName: input.displayName,
            statusId: targetProfileStatus,
          },
        }));
      if (profile.statusId !== targetProfileStatus && authResult.emailConfirmed) {
        await tx.userProfile.update({
          where: { id: profile.id },
          data: { statusId: targetProfileStatus },
        });
      }

      const membershipStatusId = authResult.emailConfirmed
        ? membershipActive.id
        : membershipInvited.id;
      const existingMembership = await tx.organizationMembership.findUnique({
        where: {
          organizationId_userProfileId: {
            organizationId: input.organizationId,
            userProfileId: profile.id,
          },
        },
      });
      const membership = existingMembership
        ? await tx.organizationMembership.update({
            where: { id: existingMembership.id },
            data: {
              statusId: membershipStatusId,
              invitedByAuthUserId: actor.authUserId,
              endedAt: null,
              joinedAt: authResult.emailConfirmed ? new Date() : null,
            },
          })
        : await tx.organizationMembership.create({
            data: {
              organizationId: input.organizationId,
              userProfileId: profile.id,
              statusId: membershipStatusId,
              invitedByAuthUserId: actor.authUserId,
              joinedAt: authResult.emailConfirmed ? new Date() : null,
            },
          });

      const roleAssignment = await tx.organizationMembershipRole.findFirst({
        where: { membershipId: membership.id, roleId: role.id },
      });
      if (roleAssignment) {
        await tx.organizationMembershipRole.update({
          where: { id: roleAssignment.id },
          data: { statusId: assignmentActive.id, revokedAt: null },
        });
      } else {
        await tx.organizationMembershipRole.create({
          data: {
            membershipId: membership.id,
            roleId: role.id,
            statusId: assignmentActive.id,
          },
        });
      }

      const desiredBranchIds =
        input.branchScope === "SELECTED" ? [...new Set(input.branchIds)] : [null];
      for (const branchId of desiredBranchIds) {
        const existing = await tx.organizationMembershipBranchScope.findFirst({
          where: {
            membershipId: membership.id,
            scopeTypeId: scope.id,
            branchId,
          },
        });
        if (existing) {
          await tx.organizationMembershipBranchScope.update({
            where: { id: existing.id },
            data: { statusId: assignmentActive.id },
          });
        } else {
          await tx.organizationMembershipBranchScope.create({
            data: {
              membershipId: membership.id,
              scopeTypeId: scope.id,
              branchId,
              statusId: assignmentActive.id,
            },
          });
        }
      }

      const finalStatus = authResult.emailConfirmed ? completed : authSent;
      await tx.userInvitation.update({
        where: { id: invitationId },
        data: {
          authUserId: authResult.authUserId,
          statusId: finalStatus.id,
          isActive: !authResult.emailConfirmed,
          platformSetupCompletedAt: new Date(),
          processingStartedAt: null,
          lastAttemptAt: new Date(),
          lastErrorCode: null,
        },
      });
      await writeAuditLog(tx, {
        organizationId: input.organizationId,
        actorAuthUserId: actor.authUserId,
        actionCode: authResult.invited
          ? MASTER.auditActionType.USER_INVITE_SENT
          : MASTER.auditActionType.USER_PLATFORM_SETUP_COMPLETED,
        entityType: "UserInvitation",
        entityId: invitationId,
        after: {
          emailMasked: maskEmail(input.email),
          authReused: authResult.reused,
          membershipId: membership.id,
        },
      });
      return {
        invitationId,
        profileId: profile.id,
        membershipId: membership.id,
        invited: authResult.invited,
        reused: authResult.reused,
        status: finalStatus.code,
      };
    },
    { isolationLevel: "Serializable" },
  );
}

export async function resendOrganizationInvitation(
  db: PrismaClient,
  actor: Actor,
  invitationId: string,
  auth: AuthInviteAdapter,
  redirectTo: string,
) {
  const invitation = await db.userInvitation.findUnique({
    where: { id: invitationId },
    include: {
      status: { select: { code: true } },
      organizationRole: { select: { code: true } },
    },
  });
  if (!invitation) {
    throw new UserInvitationError("NOT_FOUND", TH.common.notFound);
  }
  assertInvitePermission(
    actor,
    invitation.organizationId,
    invitation.organizationRole.code,
  );
  if (invitation.status.code === MASTER.userInvitationStatus.COMPLETED) {
    throw new UserInvitationError("ALREADY_ACTIVE", "บัญชีนี้เปิดใช้งานแล้ว");
  }
  const newerActive = await db.userInvitation.findFirst({
    where: {
      id: { not: invitation.id },
      organizationId: invitation.organizationId,
      emailNormalized: invitation.emailNormalized,
      isActive: true,
    },
    select: { id: true },
  });
  if (newerActive) {
    throw new UserInvitationError(
      "IDEMPOTENCY_CONFLICT",
      "มีคำเชิญที่กำลังดำเนินการสำหรับบัญชีนี้แล้ว",
    );
  }
  if (invitation.attemptCount >= MAX_INVITE_ATTEMPTS) {
    throw new UserInvitationError(
      "MAX_ATTEMPTS",
      "ส่งคำเชิญครบจำนวนครั้งที่กำหนดแล้ว",
    );
  }
  if (
    invitation.lastAttemptAt &&
    Date.now() - invitation.lastAttemptAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    throw new UserInvitationError(
      "RATE_LIMITED",
      "กรุณารออย่างน้อย 5 นาทีก่อนส่งอีกครั้ง",
    );
  }
  const claim = await db.userInvitation.updateMany({
    where: {
      id: invitation.id,
      attemptCount: { lt: MAX_INVITE_ATTEMPTS },
      AND: [
        {
          OR: [
            { processingStartedAt: null },
            {
              processingStartedAt: {
                lt: new Date(Date.now() - 15 * 60 * 1000),
              },
            },
          ],
        },
        {
          OR: [
            { lastAttemptAt: null },
            {
              lastAttemptAt: {
                lt: new Date(Date.now() - RESEND_COOLDOWN_MS),
              },
            },
          ],
        },
      ],
    },
    data: { processingStartedAt: new Date() },
  });
  if (claim.count === 0) {
    throw new UserInvitationError(
      "RATE_LIMITED",
      "กรุณารออย่างน้อย 5 นาทีก่อนส่งอีกครั้ง",
    );
  }

  await writeAuditLog(db, {
    organizationId: invitation.organizationId,
    actorAuthUserId: actor.authUserId,
    actionCode: MASTER.auditActionType.USER_REINVITE_REQUESTED,
    entityType: "UserInvitation",
    entityId: invitation.id,
    after: { emailMasked: maskEmail(invitation.emailNormalized) },
  });
  try {
    const result = await auth.resendInvite({
      email: invitation.emailNormalized,
      redirectTo,
    });
    const authSentId = await invitationStatusId(
      db,
      MASTER.userInvitationStatus.AUTH_SENT,
    );
    await db.$transaction(async (tx) => {
      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: {
          authUserId: result.authUserId,
          statusId: authSentId,
          isActive: true,
          authInviteSentAt: new Date(),
          lastAttemptAt: new Date(),
          lastErrorCode: null,
          processingStartedAt: null,
          attemptCount: { increment: 1 },
        },
      });
      await writeAuditLog(tx, {
        organizationId: invitation.organizationId,
        actorAuthUserId: actor.authUserId,
        actionCode: MASTER.auditActionType.USER_REINVITE_SENT,
        entityType: "UserInvitation",
        entityId: invitation.id,
        after: { emailMasked: maskEmail(invitation.emailNormalized) },
      });
    });
    return { invitationId: invitation.id, status: MASTER.userInvitationStatus.AUTH_SENT };
  } catch (error) {
    const code =
      error instanceof AuthInviteError ? error.code : "AUTH_INVITE_FAILED";
    await db.$transaction(async (tx) => {
      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: {
          processingStartedAt: null,
          lastAttemptAt: new Date(),
          lastErrorCode: code,
          attemptCount: { increment: 1 },
        },
      });
      await writeAuditLog(tx, {
        organizationId: invitation.organizationId,
        actorAuthUserId: actor.authUserId,
        actionCode: MASTER.auditActionType.USER_REINVITE_FAILED,
        entityType: "UserInvitation",
        entityId: invitation.id,
        after: {
          errorCode: code,
          emailMasked: maskEmail(invitation.emailNormalized),
        },
      });
    });
    throw error;
  }
}

export async function acceptInvitationForAuthUser(
  db: PrismaClient,
  authUserId: string,
) {
  const completedId = await invitationStatusId(
    db,
    MASTER.userInvitationStatus.COMPLETED,
  );
  const membershipActive = await db.membershipStatus.findUnique({
    where: { code: MASTER.membershipStatus.ACTIVE },
  });
  const profileActive = await db.userProfileStatus.findUnique({
    where: { code: MASTER.userProfileStatus.ACTIVE },
  });
  if (!membershipActive || !profileActive) {
    throw new UserInvitationError(
      "INVITE_NOT_READY",
      "บัญชีอยู่ระหว่างจัดเตรียม กรุณาติดต่อผู้ดูแลระบบ",
    );
  }
  const invitation = await db.userInvitation.findFirst({
    where: {
      authUserId,
      status: {
        code: {
          in: [
            MASTER.userInvitationStatus.AUTH_SENT,
            MASTER.userInvitationStatus.COMPLETED,
          ],
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!invitation || !invitation.platformSetupCompletedAt) {
    throw new UserInvitationError(
      "INVITE_NOT_READY",
      "บัญชีอยู่ระหว่างจัดเตรียม กรุณาติดต่อผู้ดูแลระบบ",
    );
  }
  const profile = await db.userProfile.findUnique({ where: { authUserId } });
  if (!profile) {
    throw new UserInvitationError(
      "INVITE_NOT_READY",
      "บัญชีอยู่ระหว่างจัดเตรียม กรุณาติดต่อผู้ดูแลระบบ",
    );
  }
  await db.$transaction(async (tx) => {
    await tx.userProfile.update({
      where: { id: profile.id },
      data: { statusId: profileActive.id },
    });
    await tx.organizationMembership.update({
      where: {
        organizationId_userProfileId: {
          organizationId: invitation.organizationId,
          userProfileId: profile.id,
        },
      },
      data: {
        statusId: membershipActive.id,
        joinedAt: new Date(),
        endedAt: null,
      },
    });
    await tx.userInvitation.update({
      where: { id: invitation.id },
      data: { statusId: completedId, isActive: false, lastErrorCode: null },
    });
    await writeAuditLog(tx, {
      organizationId: invitation.organizationId,
      actorAuthUserId: authUserId,
      actionCode: MASTER.auditActionType.USER_INVITE_ACCEPTED,
      entityType: "UserInvitation",
      entityId: invitation.id,
    });
  });
  return { ok: true as const };
}

async function invitationStatusId(db: Db, code: string): Promise<string> {
  const row = await db.userInvitationStatus.findUnique({ where: { code } });
  if (!row) throw new Error(`Missing user invitation status: ${code}`);
  return row.id;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}
