import type { PrismaClient } from "@prisma/client";

import { MASTER } from "@/lib/platform/master-codes";

/**
 * Purge tenant/business data so a real end-to-end test starts from a clean
 * slate, keeping master + catalog rows (statuses, roles, permissions, products,
 * plans) and an explicit allow-list of accounts and organizations.
 *
 * Deletes are ordered by foreign key, not left to cascades, so the report
 * matches exactly what was removed. Supabase Auth users are never touched.
 */

export const DEFAULT_KEEP_EMAILS = ["nsomprasong@gmail.com"] as const;
export const DEFAULT_KEEP_ORGANIZATION_CODES = ["GOLDENSOFT"] as const;

export type PurgeOptions = {
  keepEmails: string[];
  keepOrganizationCodes: string[];
  /**
   * UI “เริ่มต้นใหม่” for SUPER_ADMIN may run in production with typed confirm.
   * CLI `purge:tenant-data` never sets this.
   */
  allowProduction?: boolean;
};

export type PurgeCounts = Record<string, number>;

export type PurgePlan = {
  keptProfiles: { id: string; email: string }[];
  keptOrganizations: { id: string; customerCode: string }[];
  organizations: { id: string; customerCode: string; displayName: string }[];
  profiles: { id: string; email: string }[];
  counts: PurgeCounts;
  /** False until migration 0008 is applied; the purge works either way. */
  passwordResetTablePresent: boolean;
};

export class PurgeSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurgeSafetyError";
  }
}

function normalizeEmails(emails: string[]): string[] {
  return [
    ...new Set(
      emails.map((email) => email.trim().toLowerCase()).filter(Boolean),
    ),
  ];
}

function normalizeCodes(codes: string[]): string[] {
  return [
    ...new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean)),
  ];
}

async function hasPasswordResetTable(db: PrismaClient): Promise<boolean> {
  const rows = await db.$queryRaw<{ present: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'platform' AND table_name = 'user_password_resets'
    ) AS "present"`;
  return rows[0]?.present ?? false;
}

function assertSafeToPurge(allowProduction?: boolean): void {
  if (process.env.NODE_ENV === "production" && !allowProduction) {
    throw new PurgeSafetyError("ห้ามล้างข้อมูลในสภาพแวดล้อม production");
  }
}

export async function planPurge(
  db: PrismaClient,
  options: PurgeOptions,
): Promise<PurgePlan> {
  assertSafeToPurge(options.allowProduction);

  const keepEmails = normalizeEmails(options.keepEmails);
  const keepOrganizationCodes = normalizeCodes(options.keepOrganizationCodes);
  if (keepEmails.length === 0) {
    throw new PurgeSafetyError(
      "ต้องระบุอีเมลที่ต้องการเก็บไว้อย่างน้อยหนึ่งรายการ",
    );
  }

  const keptProfiles = await db.userProfile.findMany({
    where: { email: { in: keepEmails } },
    select: { id: true, email: true },
  });
  const missing = keepEmails.filter(
    (email) => !keptProfiles.some((profile) => profile.email === email),
  );
  if (missing.length > 0) {
    throw new PurgeSafetyError(
      `ไม่พบบัญชีที่ต้องการเก็บไว้: ${missing.join(", ")} — ตรวจสอบอีเมลก่อนล้างข้อมูล`,
    );
  }

  // Refuse to leave the platform without an operator who can sign in.
  const keptSuperAdmins = await db.platformRoleAssignment.count({
    where: {
      userProfileId: { in: keptProfiles.map((profile) => profile.id) },
      revokedAt: null,
      role: { code: MASTER.platformRole.SUPER_ADMIN },
      status: { code: MASTER.assignmentStatus.ACTIVE },
    },
  });
  if (keptSuperAdmins === 0) {
    throw new PurgeSafetyError(
      "บัญชีที่เก็บไว้ไม่มีบทบาท SUPER_ADMIN ที่ใช้งานอยู่ — กำหนดบทบาทก่อน แล้วจึงล้างข้อมูล",
    );
  }

  const keptOrganizations = await db.organization.findMany({
    where: { customerCode: { in: keepOrganizationCodes } },
    select: { id: true, customerCode: true },
  });

  const keptOrganizationIds = keptOrganizations.map((org) => org.id);
  const keptProfileIds = keptProfiles.map((profile) => profile.id);

  const organizations = await db.organization.findMany({
    where: { id: { notIn: keptOrganizationIds } },
    select: { id: true, customerCode: true, displayName: true },
    orderBy: { customerCode: "asc" },
  });
  const profiles = await db.userProfile.findMany({
    where: { id: { notIn: keptProfileIds } },
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });

  const organizationIds = organizations.map((org) => org.id);
  const profileIds = profiles.map((profile) => profile.id);
  const orgFilter = { organizationId: { in: organizationIds } };
  const passwordResetTablePresent = await hasPasswordResetTable(db);

  const counts: PurgeCounts = {
    organizations: organizations.length,
    userProfiles: profiles.length,
    paymentAllocations: await db.paymentAllocation.count({
      where: { OR: [{ payment: orgFilter }, { invoice: orgFilter }] },
    }),
    invoiceItems: await db.invoiceItem.count({ where: { invoice: orgFilter } }),
    invoices: await db.invoice.count({ where: orgFilter }),
    payments: await db.payment.count({ where: orgFilter }),
    creditTransactions: await db.creditTransaction.count({ where: orgFilter }),
    billingContacts: await db.billingContact.count({ where: orgFilter }),
    billingAccounts: await db.billingAccount.count({ where: orgFilter }),
    userInvitations: await db.userInvitation.count({
      where: {
        OR: [orgFilter, { invitedByProfileId: { in: profileIds } }],
      },
    }),
    entitlements: await db.entitlement.count({ where: orgFilter }),
    subscriptions: await db.subscription.count({ where: orgFilter }),
    subscriptionHistories: await db.subscriptionHistory.count({
      where: orgFilter,
    }),
    organizationProductMemberships:
      await db.organizationProductMembership.count({
        where: { OR: [orgFilter, { userProfileId: { in: profileIds } }] },
      }),
    organizationMemberships: await db.organizationMembership.count({
      where: { OR: [orgFilter, { userProfileId: { in: profileIds } }] },
    }),
    customOrganizationRoles: await db.organizationRole.count({
      where: { organizationId: { in: organizationIds } },
    }),
    branches: await db.branch.count({ where: orgFilter }),
    staffOrganizationAssignments: await db.staffOrganizationAssignment.count({
      where: { OR: [orgFilter, { staffUserProfileId: { in: profileIds } }] },
    }),
    organizationOnboardings: await db.organizationOnboarding.count({
      where: orgFilter,
    }),
    legacyIdentityMappings: await db.legacyIdentityMapping.count({
      where: orgFilter,
    }),
    auditLogs: await db.auditLog.count({ where: orgFilter }),
    outboxEvents: await db.outboxEvent.count({
      where: { organizationId: { in: organizationIds } },
    }),
    userPasswordResets: passwordResetTablePresent
      ? await db.userPasswordReset.count({
          where: { userProfileId: { in: profileIds } },
        })
      : 0,
    platformRoleAssignments: await db.platformRoleAssignment.count({
      where: { userProfileId: { in: profileIds } },
    }),
    userPreferences: await db.userPreference.count({
      where: { userProfileId: { in: profileIds } },
    }),
  };

  return {
    keptProfiles,
    keptOrganizations,
    organizations,
    profiles,
    counts,
    passwordResetTablePresent,
  };
}

export async function purgeData(
  db: PrismaClient,
  options: PurgeOptions,
): Promise<{ plan: PurgePlan }> {
  const plan = await planPurge(db, options);
  const organizationIds = plan.organizations.map((org) => org.id);
  const profileIds = plan.profiles.map((profile) => profile.id);
  if (organizationIds.length === 0 && profileIds.length === 0) {
    return { plan };
  }
  const orgFilter = { organizationId: { in: organizationIds } };

  await db.$transaction(
    async (tx) => {
      // Billing: allocations and invoice lines block invoices/payments, which
      // in turn block billing accounts (all RESTRICT).
      await tx.paymentAllocation.deleteMany({
        where: { OR: [{ payment: orgFilter }, { invoice: orgFilter }] },
      });
      await tx.invoiceItem.deleteMany({ where: { invoice: orgFilter } });
      await tx.invoice.deleteMany({ where: orgFilter });
      await tx.payment.deleteMany({ where: orgFilter });
      await tx.creditTransaction.deleteMany({ where: orgFilter });
      await tx.billingContact.deleteMany({ where: orgFilter });
      await tx.billingAccount.deleteMany({ where: orgFilter });

      // Invitations RESTRICT both the organization and the inviting profile.
      await tx.userInvitation.deleteMany({
        where: { OR: [orgFilter, { invitedByProfileId: { in: profileIds } }] },
      });

      await tx.entitlement.deleteMany({ where: orgFilter });
      await tx.subscriptionFeatureOverride.deleteMany({
        where: { subscription: orgFilter },
      });
      await tx.subscriptionHistory.deleteMany({ where: orgFilter });
      await tx.subscription.deleteMany({ where: orgFilter });

      await tx.organizationProductMembership.deleteMany({
        where: { OR: [orgFilter, { userProfileId: { in: profileIds } }] },
      });
      await tx.organizationMembershipRole.deleteMany({
        where: {
          membership: {
            OR: [orgFilter, { userProfileId: { in: profileIds } }],
          },
        },
      });
      await tx.organizationMembershipBranchScope.deleteMany({
        where: {
          membership: {
            OR: [orgFilter, { userProfileId: { in: profileIds } }],
          },
        },
      });
      await tx.organizationMembership.deleteMany({
        where: { OR: [orgFilter, { userProfileId: { in: profileIds } }] },
      });

      // Organization-scoped custom roles only; system roles are master data.
      await tx.organizationRolePermission.deleteMany({
        where: { organizationRole: { organizationId: { in: organizationIds } } },
      });
      await tx.organizationRole.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });

      await tx.branch.deleteMany({ where: orgFilter });
      await tx.staffOrganizationAssignment.deleteMany({
        where: { OR: [orgFilter, { staffUserProfileId: { in: profileIds } }] },
      });
      await tx.organizationOnboarding.deleteMany({ where: orgFilter });
      await tx.legacyIdentityMapping.deleteMany({ where: orgFilter });
      await tx.auditLog.deleteMany({ where: orgFilter });
      await tx.outboxEvent.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });

      // Kept accounts must not point at an organization that is going away.
      await tx.userPreference.updateMany({
        where: { lastOrganizationId: { in: organizationIds } },
        data: { lastOrganizationId: null, lastBranchId: null },
      });

      await tx.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });

      if (plan.passwordResetTablePresent) {
        await tx.userPasswordReset.deleteMany({
          where: { userProfileId: { in: profileIds } },
        });
      }
      await tx.platformRoleAssignment.deleteMany({
        where: { userProfileId: { in: profileIds } },
      });
      await tx.userPreference.deleteMany({
        where: { userProfileId: { in: profileIds } },
      });
      await tx.userProfile.deleteMany({ where: { id: { in: profileIds } } });
    },
    { timeout: 120_000 },
  );

  return { plan };
}
