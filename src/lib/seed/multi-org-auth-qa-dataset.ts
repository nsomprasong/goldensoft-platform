/**
 * Multi-org Auth ↔ Employee QA addon (Platform).
 *
 * Prerequisite: `npm run seed:full-qa` (TEST-ALPHA / TEST-BETA must exist).
 * Password: same as full-QA (`11111111`).
 *
 * Creates Auth users that exercise:
 * - one Auth → membership in both ALPHA + BETA
 * - single-org multi-branch (branch picker)
 * - rehire auth (Platform membership once; HR owns terminated/active rows)
 */
import type { PrismaClient } from "@prisma/client";

import {
  createStaffAuthAdapter,
  StaffAuthError,
  type StaffAuthPort,
} from "@/lib/auth/staff-auth-adapter";
import { MASTER } from "@/lib/platform/master-codes";
import { requireActiveMasterId } from "@/lib/platform/master-data";
import { FULL_QA_PASSWORD } from "@/lib/seed/full-qa-dataset";

export const MULTI_ORG_QA_PASSWORD = FULL_QA_PASSWORD;
export const MULTI_ORG_QA_MARKER = "multi-org-auth-qa";
export const MULTI_ORG_QA_ORG_CODES = ["TEST-ALPHA", "TEST-BETA"] as const;

export type MultiOrgQaPerson = {
  key: string;
  email: string;
  phone: string;
  displayName: string;
  firstNameTh: string;
  lastNameTh: string;
  /** Orgs this Auth joins (same authUserId). */
  memberships: Array<{
    orgCode: (typeof MULTI_ORG_QA_ORG_CODES)[number];
    /** Platform org role — ADMIN for dual-company tester so HR menus work. */
    orgRole: "ADMIN" | "EMPLOYEE";
    branchCode: "ALL" | "HQ" | "B2";
    /** HR home branch for employee row. */
    homeBranch: "HQ" | "B2";
    employeeCode: string;
  }>;
  scenario: string;
};

/** Canonical roster — keep in sync with HR multi-org-auth-qa-dataset.ts */
export const MULTI_ORG_QA_ROSTER: readonly MultiOrgQaPerson[] = [
  {
    key: "both-companies",
    email: "x.both@ex.com",
    phone: "0830000001",
    displayName: "ขวัญใจ สองบริษัท",
    firstNameTh: "ขวัญใจ",
    lastNameTh: "สองบริษัท",
    memberships: [
      {
        orgCode: "TEST-ALPHA",
        orgRole: "ADMIN",
        branchCode: "ALL",
        homeBranch: "HQ",
        employeeCode: "MOA-BOTH",
      },
      {
        orgCode: "TEST-BETA",
        orgRole: "ADMIN",
        branchCode: "HQ",
        homeBranch: "HQ",
        employeeCode: "MOA-BOTH",
      },
    ],
    scenario:
      "Auth เดียว · ADMIN อัลฟ่า+เบต้า + พนักงาน MOA-BOTH — สลับบริษัทและใช้เมนู HR ได้",
  },
  {
    key: "alpha-multibranch",
    email: "x.branch@ex.com",
    phone: "0830000002",
    displayName: "สาขาชัด หลายสาขา",
    firstNameTh: "สาขาชัด",
    lastNameTh: "หลายสาขา",
    memberships: [
      {
        orgCode: "TEST-ALPHA",
        orgRole: "EMPLOYEE",
        branchCode: "ALL",
        homeBranch: "B2",
        employeeCode: "MOA-BR",
      },
    ],
    scenario:
      "องค์กรเดียวหลายสาขา (พนักงาน) — หลัง Login เลือกสาขา แล้วใช้เมนูงานของฉัน",
  },
  {
    key: "rehire-auth",
    email: "x.rehire@ex.com",
    phone: "0830000003",
    displayName: "เริ่มใหม่ รีไฮร์",
    firstNameTh: "เริ่มใหม่",
    lastNameTh: "รีไฮร์",
    memberships: [
      {
        orgCode: "TEST-ALPHA",
        orgRole: "EMPLOYEE",
        branchCode: "HQ",
        homeBranch: "HQ",
        employeeCode: "MOA-NEW",
      },
    ],
    scenario:
      "Auth สำหรับเคส terminated + rehire ใน HR (แถวเก่า inactive แถวใหม่ active)",
  },
] as const;

async function ensureAuthUser(
  auth: StaffAuthPort,
  person: MultiOrgQaPerson,
): Promise<{ authUserId: string; email: string }> {
  const existing = await auth.getUserByEmail(person.email);
  if (existing) {
    await auth.setPassword({
      authUserId: existing.authUserId,
      password: MULTI_ORG_QA_PASSWORD,
    });
    return existing;
  }
  try {
    return await auth.createUser({
      email: person.email,
      displayName: person.displayName,
      password: MULTI_ORG_QA_PASSWORD,
    });
  } catch (error) {
    if (
      error instanceof StaffAuthError &&
      error.code === "STAFF_AUTH_ALREADY_EXISTS"
    ) {
      const again = await auth.getUserByEmail(person.email);
      if (!again) throw error;
      await auth.setPassword({
        authUserId: again.authUserId,
        password: MULTI_ORG_QA_PASSWORD,
      });
      return again;
    }
    throw error;
  }
}

async function loadOrgBundle(
  db: PrismaClient,
  orgCode: string,
): Promise<{
  organizationId: string;
  branches: Record<"HQ" | "B2", { id: string; code: string }>;
  employeeRoleId: string;
  adminRoleId: string;
}> {
  const organization = await db.organization.findFirst({
    where: { customerCode: orgCode, deletedAt: null },
    select: { id: true },
  });
  if (!organization) {
    throw new Error(
      `ไม่พบองค์กร ${orgCode} — รัน npm run seed:full-qa ที่ Platform ก่อน`,
    );
  }

  const branchRows = await db.branch.findMany({
    where: { organizationId: organization.id, deletedAt: null },
    select: { id: true, code: true },
  });
  const hq = branchRows.find((b) => b.code === "HQ");
  const b2 = branchRows.find((b) => b.code === "B2");
  if (!hq || !b2) {
    throw new Error(`${orgCode} ต้องมีสาขา HQ และ B2`);
  }

  const adminRole = await db.organizationRole.findFirst({
    where: {
      code: MASTER.organizationRole.ADMIN,
      organizationId: null,
      isSystem: true,
    },
  });
  if (!adminRole) {
    throw new Error("System ADMIN role missing — run masters seed");
  }

  let employeeRole = await db.organizationRole.findFirst({
    where: { organizationId: organization.id, code: "EMPLOYEE" },
  });
  if (!employeeRole) {
    employeeRole = await db.organizationRole.create({
      data: {
        organizationId: organization.id,
        code: "EMPLOYEE",
        nameTh: "พนักงาน",
        nameEn: "Employee",
        description: MULTI_ORG_QA_MARKER,
        isSystem: false,
        isActive: true,
        sortOrder: 200,
      },
    });
  }

  const selfServiceCodes = [
    "hr.schedule.read",
    "hr.attendance.self",
    "hr.leave.self",
    "hr.overtime.self",
    "hr.payslip.self",
    "hr.advance.self",
  ] as const;
  const selfServicePerms = await db.permission.findMany({
    where: { code: { in: [...selfServiceCodes] }, isActive: true },
    select: { id: true },
  });
  for (const perm of selfServicePerms) {
    await db.organizationRolePermission.upsert({
      where: {
        organizationRoleId_permissionId: {
          organizationRoleId: employeeRole.id,
          permissionId: perm.id,
        },
      },
      create: {
        organizationRoleId: employeeRole.id,
        permissionId: perm.id,
      },
      update: { revokedAt: null },
    });
  }

  return {
    organizationId: organization.id,
    branches: { HQ: hq, B2: b2 },
    employeeRoleId: employeeRole.id,
    adminRoleId: adminRole.id,
  };
}

export type MultiOrgQaSeedResult = {
  password: string;
  users: Array<{
    key: string;
    email: string;
    displayName: string;
    authUserId: string;
    platformUserId: string;
    memberships: MultiOrgQaPerson["memberships"];
    scenario: string;
  }>;
};

export async function seedMultiOrgAuthQaDataset(
  db: PrismaClient,
  authPort?: StaffAuthPort,
): Promise<MultiOrgQaSeedResult> {
  const auth = authPort ?? createStaffAuthAdapter();
  const profileActiveId = await requireActiveMasterId(
    db,
    "userProfileStatus",
    MASTER.userProfileStatus.ACTIVE,
  );
  const membershipActiveId = await requireActiveMasterId(
    db,
    "membershipStatus",
    MASTER.membershipStatus.ACTIVE,
  );
  const assignmentActiveId = await requireActiveMasterId(
    db,
    "assignmentStatus",
    MASTER.assignmentStatus.ACTIVE,
  );
  const allBranchesScopeId = await requireActiveMasterId(
    db,
    "branchScopeType",
    MASTER.branchScopeType.ALL_BRANCHES,
  );
  const selectedScopeId = await requireActiveMasterId(
    db,
    "branchScopeType",
    MASTER.branchScopeType.SELECTED,
  );

  const orgBundles = new Map<string, Awaited<ReturnType<typeof loadOrgBundle>>>();
  for (const code of MULTI_ORG_QA_ORG_CODES) {
    orgBundles.set(code, await loadOrgBundle(db, code));
  }

  const users: MultiOrgQaSeedResult["users"] = [];

  for (const person of MULTI_ORG_QA_ROSTER) {
    const authUser = await ensureAuthUser(auth, person);

    let profile = await db.userProfile.findUnique({
      where: { authUserId: authUser.authUserId },
    });
    if (!profile) {
      profile = await db.userProfile.findFirst({
        where: { email: person.email.toLowerCase(), deletedAt: null },
      });
    }
    if (!profile) {
      profile = await db.userProfile.create({
        data: {
          authUserId: authUser.authUserId,
          email: person.email.toLowerCase(),
          displayName: person.displayName,
          phone: person.phone,
          statusId: profileActiveId,
        },
      });
    } else {
      profile = await db.userProfile.update({
        where: { id: profile.id },
        data: {
          authUserId: authUser.authUserId,
          email: person.email.toLowerCase(),
          displayName: person.displayName,
          phone: person.phone,
          statusId: profileActiveId,
          deletedAt: null,
        },
      });
    }

    for (const membershipDef of person.memberships) {
      const bundle = orgBundles.get(membershipDef.orgCode)!;
      let membership = await db.organizationMembership.findUnique({
        where: {
          organizationId_userProfileId: {
            organizationId: bundle.organizationId,
            userProfileId: profile.id,
          },
        },
      });
      if (!membership) {
        membership = await db.organizationMembership.create({
          data: {
            organizationId: bundle.organizationId,
            userProfileId: profile.id,
            statusId: membershipActiveId,
            joinedAt: new Date(),
          },
        });
      } else {
        membership = await db.organizationMembership.update({
          where: { id: membership.id },
          data: { statusId: membershipActiveId },
        });
      }

      await db.organizationMembershipRole.deleteMany({
        where: { membershipId: membership.id },
      });
      const roleId =
        membershipDef.orgRole === "ADMIN"
          ? bundle.adminRoleId
          : bundle.employeeRoleId;
      await db.organizationMembershipRole.create({
        data: {
          membershipId: membership.id,
          roleId,
          statusId: assignmentActiveId,
        },
      });

      await db.organizationMembershipBranchScope.deleteMany({
        where: { membershipId: membership.id },
      });
      if (membershipDef.branchCode === "ALL") {
        await db.organizationMembershipBranchScope.create({
          data: {
            membershipId: membership.id,
            scopeTypeId: allBranchesScopeId,
            statusId: assignmentActiveId,
          },
        });
      } else {
        await db.organizationMembershipBranchScope.create({
          data: {
            membershipId: membership.id,
            scopeTypeId: selectedScopeId,
            branchId: bundle.branches[membershipDef.branchCode].id,
            statusId: assignmentActiveId,
          },
        });
      }
    }

    users.push({
      key: person.key,
      email: person.email,
      displayName: person.displayName,
      authUserId: authUser.authUserId,
      platformUserId: profile.id,
      memberships: [...person.memberships],
      scenario: person.scenario,
    });
  }

  return { password: MULTI_ORG_QA_PASSWORD, users };
}

export async function cleanupMultiOrgAuthQaDataset(
  db: PrismaClient,
  authPort?: StaffAuthPort,
): Promise<{ profiles: number; authRevoked: number }> {
  const auth = authPort ?? createStaffAuthAdapter();
  const emails = MULTI_ORG_QA_ROSTER.map((p) => p.email.toLowerCase());
  const profiles = await db.userProfile.findMany({
    where: { email: { in: emails }, deletedAt: null },
    select: { id: true, authUserId: true, email: true },
  });

  let authRevoked = 0;
  for (const profile of profiles) {
    const memberships = await db.organizationMembership.findMany({
      where: { userProfileId: profile.id },
      select: { id: true },
    });
    for (const m of memberships) {
      await db.organizationMembershipBranchScope.deleteMany({
        where: { membershipId: m.id },
      });
      await db.organizationMembershipRole.deleteMany({
        where: { membershipId: m.id },
      });
    }
    await db.organizationMembership.deleteMany({
      where: { userProfileId: profile.id },
    });
    await db.userProfile.update({
      where: { id: profile.id },
      data: { deletedAt: new Date() },
    });
    if (profile.authUserId) {
      try {
        await auth.setPassword({
          authUserId: profile.authUserId,
          password: `revoked-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
        authRevoked += 1;
      } catch {
        // ignore revoke failures on missing auth
      }
    }
  }

  return { profiles: profiles.length, authRevoked };
}
