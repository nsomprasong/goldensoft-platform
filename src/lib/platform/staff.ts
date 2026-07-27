import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import type {
  AuthInviteAdapter,
  AuthInviteChannel,
} from "@/lib/auth/auth-invite-adapter";
import {
  generateUnguessablePassword,
  type StaffAuthPort,
} from "@/lib/auth/staff-auth-adapter";
import { TH } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import {
  AdminGuardError,
  assertCanRemoveSuperAdmin,
} from "@/lib/platform/admin-guards";
import { writeAuditLog } from "@/lib/platform/audit";
import { MASTER } from "@/lib/platform/master-codes";
import { requireActiveMasterId } from "@/lib/platform/master-data";
import {
  composeStaffDisplayName,
  staffIdentityFieldsSchema,
  staffIdentityFromDb,
  staffIdentityToDb,
} from "@/lib/platform/staff-identity";
import {
  resolveAuthEmailForPhoneLogin,
  syntheticEmailFromPhone,
  toE164ThaiMobile,
} from "@/lib/platform/system-settings";

type Db = PrismaClient | Prisma.TransactionClient;

/** How long an administrator-opened reset window stays usable. */
export const PASSWORD_RESET_TTL_MINUTES = 60;

export class StaffAdminError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "VALIDATION"
    | "EXPIRED";

  constructor(code: StaffAdminError["code"], message: string) {
    super(message);
    this.name = "StaffAdminError";
    this.code = code;
  }
}

export type StaffActor = { authUserId: string; platformRoles: string[] };

/**
 * GoldenSoft's own employees carry platform roles, so administering them is
 * restricted to SUPER_ADMIN — same rule as assigning platform roles.
 */
export function canManageStaff(actor: { platformRoles: string[] }): boolean {
  return actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
}

export function assertCanManageStaff(actor: { platformRoles: string[] }): void {
  if (!canManageStaff(actor)) {
    throw new StaffAdminError("FORBIDDEN", TH.common.forbidden);
  }
}

export function canResetUserPassword(actor: {
  platformRoles: string[];
}): boolean {
  return permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: [],
  }).includes(PLATFORM_PERMISSIONS.userPasswordReset);
}

export function assertCanResetUserPassword(actor: {
  platformRoles: string[];
}): void {
  if (!canResetUserPassword(actor)) {
    throw new StaffAdminError("FORBIDDEN", TH.common.forbidden);
  }
}

export const staffCreateSchema = z
  .object({
    email: z
      .string()
      .trim()
      .max(200)
      .email()
      .transform((value) => value.toLowerCase()),
    roleCodes: z
      .array(z.string().trim().min(2).max(64))
      .min(1)
      .max(10)
      .transform((codes) => [...new Set(codes)]),
  })
  .merge(staffIdentityFieldsSchema);

export const staffUpdateSchema = z
  .object({
    statusCode: z
      .enum([
        MASTER.userProfileStatus.ACTIVE,
        MASTER.userProfileStatus.DISABLED,
      ])
      .optional(),
  })
  .merge(staffIdentityFieldsSchema.partial())
  .refine(
    (value) =>
      value.statusCode !== undefined ||
      value.titleCode !== undefined ||
      value.firstNameTh !== undefined ||
      value.lastNameTh !== undefined ||
      value.nationalId !== undefined ||
      value.dateOfBirth !== undefined ||
      value.addressLine !== undefined ||
      value.phone !== undefined,
    { message: "ไม่มีข้อมูลที่ต้องการแก้ไข" },
  );

async function activeAssignmentStatusId(db: Db): Promise<string> {
  return requireActiveMasterId(
    db,
    "assignmentStatus",
    MASTER.assignmentStatus.ACTIVE,
  );
}

function openResetWhere(now: Date): Prisma.UserPasswordResetWhereInput {
  return { consumedAt: null, cancelledAt: null, expiresAt: { gt: now } };
}

/** Staff = user profiles holding at least one active platform role. */
export async function listStaffMembers(db: PrismaClient, now = new Date()) {
  const statusId = await activeAssignmentStatusId(db);
  const rows = await db.userProfile.findMany({
    where: {
      deletedAt: null,
      platformRoles: { some: { statusId, revokedAt: null } },
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      lastLoginAt: true,
      status: { select: { code: true } },
      staffProfile: {
        select: {
          titleCode: true,
          firstNameTh: true,
          lastNameTh: true,
          nationalId: true,
          phone: true,
        },
      },
      platformRoles: {
        where: { statusId, revokedAt: null },
        select: {
          id: true,
          role: { select: { id: true, code: true, nameTh: true } },
        },
        orderBy: { assignedAt: "asc" },
      },
      passwordResets: {
        where: openResetWhere(now),
        select: { id: true, expiresAt: true },
        orderBy: { requestedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { displayName: "asc" },
    take: 300,
  });

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    statusCode: row.status.code,
    lastLoginAt: row.lastLoginAt,
    nationalId: row.staffProfile?.nationalId ?? null,
    phone: row.staffProfile?.phone ?? null,
    roles: row.platformRoles.map((assignment) => ({
      assignmentId: assignment.id,
      roleId: assignment.role.id,
      code: assignment.role.code,
      nameTh: assignment.role.nameTh,
    })),
    openPasswordReset: row.passwordResets[0] ?? null,
  }));
}

export async function getStaffMember(
  db: PrismaClient,
  userProfileId: string,
  now = new Date(),
) {
  const statusId = await activeAssignmentStatusId(db);
  const profile = await db.userProfile.findFirst({
    where: { id: userProfileId, deletedAt: null },
    select: {
      id: true,
      email: true,
      displayName: true,
      lastLoginAt: true,
      status: { select: { code: true } },
      staffProfile: {
        select: {
          titleCode: true,
          firstNameTh: true,
          lastNameTh: true,
          nationalId: true,
          dateOfBirth: true,
          addressLine: true,
          phone: true,
        },
      },
      platformRoles: {
        where: { statusId, revokedAt: null },
        select: {
          id: true,
          role: { select: { id: true, code: true, nameTh: true } },
        },
        orderBy: { assignedAt: "asc" },
      },
      passwordResets: {
        where: openResetWhere(now),
        select: { id: true, expiresAt: true, requestedAt: true },
        orderBy: { requestedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    statusCode: profile.status.code,
    lastLoginAt: profile.lastLoginAt,
    identity: profile.staffProfile
      ? staffIdentityFromDb(profile.staffProfile)
      : null,
    roles: profile.platformRoles.map((assignment) => ({
      assignmentId: assignment.id,
      roleId: assignment.role.id,
      code: assignment.role.code,
      nameTh: assignment.role.nameTh,
    })),
    openPasswordReset: profile.passwordResets[0] ?? null,
  };
}

/**
 * Create an internal employee: one Supabase Auth user, one profile, and the
 * requested platform roles. A brand-new Auth user gets an unguessable
 * placeholder password plus an open reset window, so the employee sets their
 * own password on first sign-in and nobody — including the operator — knows it.
 */
export async function createStaffMember(
  db: PrismaClient,
  input: {
    actor: StaffActor;
    auth: StaffAuthPort;
    payload: unknown;
    ttlMinutes?: number;
    now?: Date;
  },
) {
  assertCanManageStaff(input.actor);
  const parsedPayload = staffCreateSchema.safeParse(input.payload);
  if (!parsedPayload.success) {
    throw new StaffAdminError(
      "VALIDATION",
      parsedPayload.error.issues[0]?.message ?? TH.common.failed,
    );
  }
  const payload = parsedPayload.data;
  const now = input.now ?? new Date();
  const displayName = composeStaffDisplayName(payload);
  const identity = staffIdentityToDb(payload);

  const existingProfile = await db.userProfile.findUnique({
    where: { email: payload.email },
    select: { id: true, deletedAt: true },
  });
  if (existingProfile) {
    throw new StaffAdminError(
      "CONFLICT",
      existingProfile.deletedAt
        ? "อีเมลนี้เคยถูกใช้งานและถูกลบไปแล้ว กรุณาใช้อีเมลอื่น"
        : "อีเมลนี้มีผู้ใช้งานอยู่แล้ว",
    );
  }

  if (identity.nationalId) {
    const nationalIdOwner = await db.staffProfile.findUnique({
      where: { nationalId: identity.nationalId },
      select: { userProfileId: true },
    });
    if (nationalIdOwner) {
      throw new StaffAdminError("CONFLICT", TH.staff.nationalIdInUse);
    }
  }

  const roles = await db.platformRole.findMany({
    where: { code: { in: payload.roleCodes }, isActive: true },
    select: { id: true, code: true },
  });
  if (roles.length !== payload.roleCodes.length) {
    throw new StaffAdminError("NOT_FOUND", "ไม่พบบทบาทแพลตฟอร์มที่เลือก");
  }

  const existingAuthUser = await input.auth.getUserByEmail(payload.email);
  const phoneE164 = identity.phone ? toE164ThaiMobile(identity.phone) : null;
  const authUser =
    existingAuthUser ??
    (await input.auth.createUser({
      email: payload.email,
      displayName,
      password: generateUnguessablePassword(),
      phone: phoneE164,
    }));
  // Only a freshly created login needs the passwordless bootstrap; an existing
  // Auth account keeps its current password until an operator resets it.
  const needsPasswordSetup = existingAuthUser === null;

  if (existingAuthUser && phoneE164) {
    try {
      await input.auth.updateUserPhone?.({
        authUserId: existingAuthUser.authUserId,
        phone: phoneE164,
      });
    } catch {
      // Phone sync is best-effort; email login still works.
    }
  }

  const profileStatusId = await requireActiveMasterId(
    db,
    "userProfileStatus",
    MASTER.userProfileStatus.ACTIVE,
  );
  const assignmentStatusId = await activeAssignmentStatusId(db);
  const expiresAt = resetExpiry(now, input.ttlMinutes);

  return db.$transaction(async (tx) => {
    const profile = await tx.userProfile.create({
      data: {
        authUserId: authUser.authUserId,
        email: payload.email,
        phone: phoneE164,
        displayName,
        statusId: profileStatusId,
      },
      select: { id: true, email: true, displayName: true },
    });

    await tx.staffProfile.create({
      data: {
        userProfileId: profile.id,
        ...identity,
      },
    });

    await tx.platformRoleAssignment.createMany({
      data: roles.map((role) => ({
        userProfileId: profile.id,
        roleId: role.id,
        statusId: assignmentStatusId,
        assignedByAuthUserId: input.actor.authUserId,
      })),
    });

    const reset = needsPasswordSetup
      ? await tx.userPasswordReset.create({
          data: {
            userProfileId: profile.id,
            requestedByAuthUserId: input.actor.authUserId,
            expiresAt,
            note: "เปิดให้ตั้งรหัสผ่านครั้งแรกเมื่อเพิ่มพนักงาน",
          },
          select: { id: true, expiresAt: true },
        })
      : null;

    await writeAuditLog(tx, {
      actorAuthUserId: input.actor.authUserId,
      actionCode: MASTER.auditActionType.STAFF_CREATE,
      entityType: "user_profile",
      entityId: profile.id,
      after: {
        email: profile.email,
        displayName: profile.displayName,
        nationalId: identity.nationalId,
        roleCodes: roles.map((role) => role.code),
        reusedExistingAuthUser: !needsPasswordSetup,
      },
    });

    return {
      userProfileId: profile.id,
      authUserId: authUser.authUserId,
      email: profile.email,
      passwordReset: reset,
    };
  });
}

export async function updateStaffMember(
  db: PrismaClient,
  input: {
    actor: StaffActor;
    userProfileId: string;
    payload: unknown;
  },
) {
  assertCanManageStaff(input.actor);
  const payload = staffUpdateSchema.parse(input.payload);

  const profile = await db.userProfile.findFirst({
    where: { id: input.userProfileId, deletedAt: null },
    select: {
      id: true,
      authUserId: true,
      displayName: true,
      status: { select: { code: true } },
      staffProfile: {
        select: {
          titleCode: true,
          firstNameTh: true,
          lastNameTh: true,
          nationalId: true,
          dateOfBirth: true,
          addressLine: true,
          phone: true,
        },
      },
    },
  });
  if (!profile) {
    throw new StaffAdminError("NOT_FOUND", TH.common.notFound);
  }

  const disabling =
    payload.statusCode === MASTER.userProfileStatus.DISABLED &&
    profile.status.code !== MASTER.userProfileStatus.DISABLED;
  if (disabling) {
    if (profile.authUserId === input.actor.authUserId) {
      throw new StaffAdminError(
        "CONFLICT",
        "ไม่สามารถปิดการใช้งานบัญชีของตัวเองได้",
      );
    }
    try {
      await assertCanRemoveSuperAdmin(db, profile.id);
    } catch (error) {
      if (error instanceof AdminGuardError) {
        throw new StaffAdminError("CONFLICT", error.message);
      }
      throw error;
    }
  }

  const identityPatchKeys = [
    "titleCode",
    "firstNameTh",
    "lastNameTh",
    "nationalId",
    "dateOfBirth",
    "addressLine",
    "phone",
  ] as const;
  const hasIdentityPatch = identityPatchKeys.some(
    (key) => payload[key] !== undefined,
  );

  let nextIdentity = profile.staffProfile
    ? staffIdentityFromDb(profile.staffProfile)
    : null;
  if (hasIdentityPatch) {
    const merged = staffIdentityFieldsSchema.parse({
      titleCode: payload.titleCode ?? nextIdentity?.titleCode,
      firstNameTh: payload.firstNameTh ?? nextIdentity?.firstNameTh,
      lastNameTh: payload.lastNameTh ?? nextIdentity?.lastNameTh,
      nationalId:
        payload.nationalId !== undefined
          ? payload.nationalId
          : (nextIdentity?.nationalId ?? null),
      dateOfBirth: payload.dateOfBirth ?? nextIdentity?.dateOfBirth,
      addressLine:
        payload.addressLine !== undefined
          ? payload.addressLine
          : (nextIdentity?.addressLine ?? null),
      phone:
        payload.phone !== undefined
          ? payload.phone
          : (nextIdentity?.phone ?? null),
    });
    nextIdentity = {
      ...merged,
      addressLine: merged.addressLine,
      phone: merged.phone,
    };

    if (
      nextIdentity.nationalId &&
      nextIdentity.nationalId !== profile.staffProfile?.nationalId
    ) {
      const conflict = await db.staffProfile.findFirst({
        where: {
          nationalId: nextIdentity.nationalId,
          NOT: { userProfileId: profile.id },
        },
        select: { id: true },
      });
      if (conflict) {
        throw new StaffAdminError("CONFLICT", TH.staff.nationalIdInUse);
      }
    }
  }

  const statusId = payload.statusCode
    ? await requireActiveMasterId(db, "userProfileStatus", payload.statusCode)
    : undefined;
  const displayName = nextIdentity
    ? composeStaffDisplayName(nextIdentity)
    : undefined;
  const phoneE164 =
    nextIdentity?.phone !== undefined && nextIdentity.phone !== null
      ? toE164ThaiMobile(nextIdentity.phone)
      : undefined;

  return db.$transaction(async (tx) => {
    const updated = await tx.userProfile.update({
      where: { id: profile.id },
      data: {
        displayName,
        statusId,
        ...(hasIdentityPatch && phoneE164 !== undefined
          ? { phone: phoneE164 }
          : {}),
      },
      select: {
        id: true,
        displayName: true,
        status: { select: { code: true } },
      },
    });

    if (nextIdentity && hasIdentityPatch) {
      const identityData = staffIdentityToDb(nextIdentity);
      await tx.staffProfile.upsert({
        where: { userProfileId: profile.id },
        create: { userProfileId: profile.id, ...identityData },
        update: identityData,
      });
    }

    await writeAuditLog(tx, {
      actorAuthUserId: input.actor.authUserId,
      actionCode: MASTER.auditActionType.STAFF_UPDATE,
      entityType: "user_profile",
      entityId: profile.id,
      before: {
        displayName: profile.displayName,
        statusCode: profile.status.code,
        nationalId: profile.staffProfile?.nationalId ?? null,
      },
      after: {
        displayName: updated.displayName,
        statusCode: updated.status.code,
        nationalId: nextIdentity?.nationalId ?? profile.staffProfile?.nationalId ?? null,
      },
    });

    return updated;
  });
}

function resetExpiry(now: Date, ttlMinutes = PASSWORD_RESET_TTL_MINUTES): Date {
  const minutes = Math.min(Math.max(Math.trunc(ttlMinutes), 5), 24 * 60);
  return new Date(now.getTime() + minutes * 60 * 1000);
}

/**
 * Open a reset window and immediately invalidate the current password, so the
 * old credentials stop working the moment an operator clicks reset. The window
 * is single-use and expires; the DB row is written first, and rolled back to
 * cancelled if the identity provider rejects the invalidation.
 */
/**
 * Core reset window opener — callers must authorize first
 * (platform password-reset permission or org-admin manage scope).
 */
export async function openPasswordResetWindow(
  db: PrismaClient,
  input: {
    actorAuthUserId: string;
    auth: StaffAuthPort;
    userProfileId: string;
    ttlMinutes?: number;
    note?: string | null;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();

  const profile = await db.userProfile.findFirst({
    where: { id: input.userProfileId, deletedAt: null },
    select: { id: true, authUserId: true, email: true },
  });
  if (!profile) {
    throw new StaffAdminError("NOT_FOUND", TH.common.notFound);
  }

  const reset = await db.$transaction(async (tx) => {
    await tx.userPasswordReset.updateMany({
      where: { userProfileId: profile.id, consumedAt: null, cancelledAt: null },
      data: { cancelledAt: now },
    });
    const created = await tx.userPasswordReset.create({
      data: {
        userProfileId: profile.id,
        requestedByAuthUserId: input.actorAuthUserId,
        expiresAt: resetExpiry(now, input.ttlMinutes),
        note: input.note?.trim() || null,
      },
      select: { id: true, expiresAt: true },
    });
    await writeAuditLog(tx, {
      actorAuthUserId: input.actorAuthUserId,
      actionCode: MASTER.auditActionType.USER_PASSWORD_RESET_REQUEST,
      entityType: "user_password_reset",
      entityId: created.id,
      after: { userProfileId: profile.id, expiresAt: created.expiresAt },
    });
    return created;
  });

  try {
    await input.auth.setPassword({
      authUserId: profile.authUserId,
      password: generateUnguessablePassword(),
    });
  } catch (error) {
    await db.userPasswordReset.update({
      where: { id: reset.id },
      data: { cancelledAt: new Date() },
    });
    throw error;
  }

  return reset;
}

export async function requestPasswordReset(
  db: PrismaClient,
  input: {
    actor: StaffActor;
    auth: StaffAuthPort;
    userProfileId: string;
    ttlMinutes?: number;
    note?: string | null;
    now?: Date;
  },
) {
  assertCanResetUserPassword(input.actor);
  return openPasswordResetWindow(db, {
    actorAuthUserId: input.actor.authUserId,
    auth: input.auth,
    userProfileId: input.userProfileId,
    ttlMinutes: input.ttlMinutes,
    note: input.note,
    now: input.now,
  });
}

/** Core cancel — callers must authorize first. */
export async function cancelPasswordResetWindow(
  db: PrismaClient,
  input: {
    actorAuthUserId: string;
    userProfileId: string;
    resetId: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();

  const reset = await db.userPasswordReset.findFirst({
    where: {
      id: input.resetId,
      userProfileId: input.userProfileId,
      consumedAt: null,
      cancelledAt: null,
    },
    select: { id: true, userProfileId: true },
  });
  if (!reset) {
    throw new StaffAdminError("NOT_FOUND", TH.common.notFound);
  }

  return db.$transaction(async (tx) => {
    const updated = await tx.userPasswordReset.update({
      where: { id: reset.id },
      data: { cancelledAt: now },
      select: { id: true, cancelledAt: true },
    });
    await writeAuditLog(tx, {
      actorAuthUserId: input.actorAuthUserId,
      actionCode: MASTER.auditActionType.USER_PASSWORD_RESET_CANCEL,
      entityType: "user_password_reset",
      entityId: reset.id,
      before: { userProfileId: reset.userProfileId },
    });
    return updated;
  });
}

export async function cancelPasswordReset(
  db: PrismaClient,
  input: {
    actor: StaffActor;
    userProfileId: string;
    resetId: string;
    now?: Date;
  },
) {
  assertCanResetUserPassword(input.actor);
  return cancelPasswordResetWindow(db, {
    actorAuthUserId: input.actor.authUserId,
    userProfileId: input.userProfileId,
    resetId: input.resetId,
    now: input.now,
  });
}

export type OpenPasswordReset = {
  id: string;
  expiresAt: Date;
  userProfileId: string;
  email: string;
  displayName: string;
};

/**
 * Look up the open reset window by email or phone (E.164 / local).
 * Callers must keep responses indistinguishable from "wrong credentials".
 */
export async function findOpenPasswordResetByEmail(
  db: PrismaClient,
  login: string,
  now = new Date(),
): Promise<OpenPasswordReset | null> {
  const raw = login.trim();
  if (!raw) return null;

  const email = raw.includes("@") ? raw.toLowerCase() : null;
  const phone = toE164ThaiMobile(raw);
  const synthetic = phone ? syntheticEmailFromPhone(phone) : null;
  const mappedEmail =
    phone && !email
      ? await resolveAuthEmailForPhoneLogin(db, phone)
      : null;
  const identityFilters = [
    ...(email ? [{ email }] : []),
    ...(mappedEmail ? [{ email: mappedEmail }] : []),
    ...(phone ? [{ phone }, ...(synthetic ? [{ email: synthetic }] : [])] : []),
  ];
  if (identityFilters.length === 0) return null;

  const reset = await db.userPasswordReset.findFirst({
    where: {
      ...openResetWhere(now),
      userProfile: {
        deletedAt: null,
        status: { code: MASTER.userProfileStatus.ACTIVE },
        OR: identityFilters,
      },
    },
    select: {
      id: true,
      expiresAt: true,
      userProfileId: true,
      userProfile: { select: { email: true, displayName: true } },
    },
    orderBy: { requestedAt: "desc" },
  });
  if (!reset) return null;

  return {
    id: reset.id,
    expiresAt: reset.expiresAt,
    userProfileId: reset.userProfileId,
    email: reset.userProfile.email,
    displayName: reset.userProfile.displayName,
  };
}

export async function getOpenPasswordResetById(
  db: PrismaClient,
  resetId: string,
  now = new Date(),
): Promise<OpenPasswordReset | null> {
  const reset = await db.userPasswordReset.findFirst({
    where: {
      id: resetId,
      ...openResetWhere(now),
      userProfile: {
        deletedAt: null,
        status: { code: MASTER.userProfileStatus.ACTIVE },
      },
    },
    select: {
      id: true,
      expiresAt: true,
      userProfileId: true,
      userProfile: { select: { email: true, displayName: true } },
    },
  });
  if (!reset) return null;

  return {
    id: reset.id,
    expiresAt: reset.expiresAt,
    userProfileId: reset.userProfileId,
    email: reset.userProfile.email,
    displayName: reset.userProfile.displayName,
  };
}

/** Consume a reset window: set the user's chosen password exactly once. */
export async function consumePasswordReset(
  db: PrismaClient,
  input: {
    auth: StaffAuthPort;
    resetId: string;
    password: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const reset = await db.userPasswordReset.findFirst({
    where: { id: input.resetId, ...openResetWhere(now) },
    select: {
      id: true,
      userProfileId: true,
      userProfile: { select: { authUserId: true, email: true, deletedAt: true } },
    },
  });
  if (!reset || reset.userProfile.deletedAt) {
    throw new StaffAdminError(
      "EXPIRED",
      "คำขอตั้งรหัสผ่านหมดอายุหรือถูกยกเลิกแล้ว กรุณาติดต่อผู้ดูแลระบบ",
    );
  }

  await input.auth.setPassword({
    authUserId: reset.userProfile.authUserId,
    password: input.password,
  });

  // Guarded update: the first request to get here wins, later ones expire.
  const consumed = await db.userPasswordReset.updateMany({
    where: { id: reset.id, consumedAt: null, cancelledAt: null },
    data: { consumedAt: now },
  });
  if (consumed.count === 0) {
    throw new StaffAdminError(
      "EXPIRED",
      "คำขอตั้งรหัสผ่านถูกใช้งานแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่",
    );
  }

  await writeAuditLog(db, {
    actorAuthUserId: reset.userProfile.authUserId,
    actionCode: MASTER.auditActionType.USER_PASSWORD_RESET_COMPLETE,
    entityType: "user_password_reset",
    entityId: reset.id,
    after: { userProfileId: reset.userProfileId },
  });

  return { email: reset.userProfile.email };
}

/**
 * Email a GoldenSoft staff member an access / setup link.
 * Opens a local password-reset window (empty-password login) as a backup when
 * the actor can reset passwords, then sends invite / resend / recovery email.
 */
export async function sendStaffInvite(
  db: PrismaClient,
  input: {
    actor: StaffActor;
    auth: StaffAuthPort;
    inviteAuth: AuthInviteAdapter;
    userProfileId: string;
    redirectTo: string;
    openPasswordReset?: boolean;
  },
): Promise<{
  email: string;
  channel: AuthInviteChannel;
  passwordResetId: string | null;
}> {
  assertCanManageStaff(input.actor);

  const statusId = await activeAssignmentStatusId(db);
  const profile = await db.userProfile.findFirst({
    where: {
      id: input.userProfileId,
      deletedAt: null,
      platformRoles: { some: { statusId, revokedAt: null } },
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      authUserId: true,
    },
  });
  if (!profile) {
    throw new StaffAdminError("NOT_FOUND", TH.common.notFound);
  }
  if (!profile.email.includes("@") || profile.email.endsWith("@phone.users.goldensoft.app")) {
    throw new StaffAdminError(
      "VALIDATION",
      "บัญชีนี้ไม่มีอีเมลจริงสำหรับส่งคำเชิญ",
    );
  }

  let passwordResetId: string | null = null;
  if (
    input.openPasswordReset !== false &&
    canResetUserPassword(input.actor)
  ) {
    const reset = await requestPasswordReset(db, {
      actor: input.actor,
      auth: input.auth,
      userProfileId: profile.id,
      note: "เปิดพร้อมส่งอีเมลคำเชิญพนักงาน",
    });
    passwordResetId = reset.id;
  }

  const result = await input.inviteAuth.inviteOrRemind({
    email: profile.email,
    displayName: profile.displayName,
    redirectTo: input.redirectTo,
  });

  await writeAuditLog(db, {
    actorAuthUserId: input.actor.authUserId,
    actionCode: MASTER.auditActionType.USER_INVITE_SENT,
    entityType: "user_profile",
    entityId: profile.id,
    after: {
      staffInvite: true,
      emailMasked: profile.email.replace(/^(.{2}).+(@.+)$/, "$1***$2"),
      channel: result.channel,
      passwordResetId,
    },
  });

  return {
    email: profile.email,
    channel: result.channel,
    passwordResetId,
  };
}
