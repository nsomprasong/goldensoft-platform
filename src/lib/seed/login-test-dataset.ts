/**
 * Login-test dataset for local QA.
 *
 * Creates a real-looking tenant (แพลูกแพรว) with Auth users that share password
 * `12345678`, so testers can sign in from /login. Cleanup removes only this
 * org + its Auth users — never GOLDENSOFT.
 */
import type { PrismaClient } from "@prisma/client";

import {
  createStaffAuthAdapter,
  StaffAuthError,
  type StaffAuthPort,
} from "@/lib/auth/staff-auth-adapter";
import { MASTER } from "@/lib/platform/master-codes";
import { requireActiveMasterId } from "@/lib/platform/master-data";
import { buildSubscriptionSnapshot } from "@/lib/platform/snapshot";
import {
  catalogFeaturesForProduct,
  generateEntitlementsForSubscription,
} from "@/lib/platform/entitlements";

export const LOGIN_TEST_ORG_CODE = "TEST-PLUKPRAEW";
export const LOGIN_TEST_ORG_SLUG = "test-plukpraew";
export const LOGIN_TEST_MARKER = "ทดสอบล็อกอิน";
export const LOGIN_TEST_PASSWORD = "12345678";
export const LOGIN_TEST_TAX_ID = "TEST-PLUKPRAEW";

/** Shared password for every seeded login account. */
export const LOGIN_TEST_SHARED_PASSWORD = LOGIN_TEST_PASSWORD;

export type LoginTestBranchCode = "HQ" | "BRANCH01";

export type LoginTestPerson = {
  /** Stable key used by HR seed to match employees. */
  key: string;
  employeeCode: string;
  email: string;
  phone: string;
  firstNameTh: string;
  lastNameTh: string;
  displayName: string;
  /** Platform org role code (system OWNER/ADMIN/BRANCH_MANAGER or custom EMPLOYEE). */
  orgRole: "OWNER" | "ADMIN" | "BRANCH_MANAGER" | "EMPLOYEE";
  /** Branch assignment for membership scope + HR home branch. */
  branchCode: LoginTestBranchCode | "ALL";
  /** Scenario tag for docs / HR fixtures. */
  scenario: string;
};

/**
 * Canonical roster — Platform Auth + HR employees must stay in sync.
 * Password for every row: 12345678
 */
export const LOGIN_TEST_ROSTER: readonly LoginTestPerson[] = [
  {
    key: "owner",
    employeeCode: "EMP-0001",
    email: "plukpraew.owner@example.com",
    phone: "0800000001",
    firstNameTh: "สมชาย",
    lastNameTh: "ใจดี",
    displayName: "สมชาย ใจดี",
    orgRole: "OWNER",
    branchCode: "ALL",
    scenario: "เจ้าขององค์กร / แอดมิน HR ครบสิทธิ์",
  },
  {
    key: "admin",
    employeeCode: "EMP-0002",
    email: "plukpraew.admin@example.com",
    phone: "0800000002",
    firstNameTh: "สมหญิง",
    lastNameTh: "รักงาน",
    displayName: "สมหญิง รักงาน",
    orgRole: "ADMIN",
    branchCode: "ALL",
    scenario: "แอดมินองค์กร (สิทธิ์ HR จัดการได้)",
  },
  {
    key: "hq-supervisor",
    employeeCode: "EMP-0003",
    email: "plukpraew.hq.supervisor@example.com",
    phone: "0800000003",
    firstNameTh: "วิชัย",
    lastNameTh: "ขยันงาน",
    displayName: "วิชัย ขยันงาน",
    orgRole: "EMPLOYEE",
    branchCode: "HQ",
    scenario: "พนักงาน HQ — self-service",
  },
  {
    key: "hq-staff-1",
    employeeCode: "EMP-0004",
    email: "plukpraew.hq.staff1@example.com",
    phone: "0800000004",
    firstNameTh: "นภา",
    lastNameTh: "สุขใจ",
    displayName: "นภา สุขใจ",
    orgRole: "EMPLOYEE",
    branchCode: "HQ",
    scenario: "พนักงาน HQ — ลา/ลงเวลา",
  },
  {
    key: "hq-staff-2",
    employeeCode: "EMP-0005",
    email: "plukpraew.hq.staff2@example.com",
    phone: "0800000005",
    firstNameTh: "ประยุทธ์",
    lastNameTh: "มั่นคง",
    displayName: "ประยุทธ์ มั่นคง",
    orgRole: "EMPLOYEE",
    branchCode: "HQ",
    scenario: "พนักงาน HQ — เงินเดือน/หักภาษี",
  },
  {
    key: "b1-manager",
    employeeCode: "EMP-0006",
    email: "plukpraew.b1.manager@example.com",
    phone: "0800000006",
    firstNameTh: "ศิริพร",
    lastNameTh: "ยิ้มแย้ม",
    displayName: "ศิริพร ยิ้มแย้ม",
    orgRole: "BRANCH_MANAGER",
    branchCode: "BRANCH01",
    scenario: "ผู้ดูแลสาขา BRANCH01 — อนุมัติในสาขา",
  },
  {
    key: "b1-staff-1",
    employeeCode: "EMP-0007",
    email: "plukpraew.b1.staff1@example.com",
    phone: "0800000007",
    firstNameTh: "อนุชา",
    lastNameTh: "ตรงเวลา",
    displayName: "อนุชา ตรงเวลา",
    orgRole: "EMPLOYEE",
    branchCode: "BRANCH01",
    scenario: "พนักงานสาขา — ขาดงาน",
  },
  {
    key: "hq-newhire",
    employeeCode: "EMP-0008",
    email: "plukpraew.hq.newhire@example.com",
    phone: "0800000008",
    firstNameTh: "จิราภรณ์",
    lastNameTh: "ใหม่งาน",
    displayName: "จิราภรณ์ ใหม่งาน",
    orgRole: "EMPLOYEE",
    branchCode: "HQ",
    scenario: "พนักงานใหม่ / ทดลองงาน",
  },
  {
    key: "hq-resigned",
    employeeCode: "EMP-0009",
    email: "plukpraew.hq.resigned@example.com",
    phone: "0800000009",
    firstNameTh: "ธนา",
    lastNameTh: "ลาออกแล้ว",
    displayName: "ธนา ลาออกแล้ว",
    orgRole: "EMPLOYEE",
    branchCode: "HQ",
    scenario: "สถานะลาออก (ยังล็อกอินได้เพื่อทดสอบ)",
  },
  {
    key: "b1-suspended",
    employeeCode: "EMP-0010",
    email: "plukpraew.b1.suspended@example.com",
    phone: "0800000010",
    firstNameTh: "วราภรณ์",
    lastNameTh: "พักงาน",
    displayName: "วราภรณ์ พักงาน",
    orgRole: "EMPLOYEE",
    branchCode: "BRANCH01",
    scenario: "สถานะพักงาน — OT รออนุมัติ",
  },
] as const;

export type LoginTestSeedResult = {
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  branches: Array<{ id: string; code: string; name: string }>;
  users: Array<{
    key: string;
    email: string;
    password: string;
    displayName: string;
    orgRole: string;
    branchCode: string;
    authUserId: string;
    platformUserId: string;
    employeeCode: string;
    scenario: string;
  }>;
};

async function ensureHrProduct(db: PrismaClient) {
  const statusId = await requireActiveMasterId(
    db,
    "productStatus",
    MASTER.productStatus.ACTIVE,
  );
  const product = await db.product.upsert({
    where: { code: "GOLDENSOFT_HR" },
    create: {
      code: "GOLDENSOFT_HR",
      name: "GoldenSoft HR",
      nameTh: "GoldenSoft HR",
      nameEn: "GoldenSoft HR",
      productType: "APPLICATION",
      sortOrder: 10,
      statusId,
    },
    update: { statusId },
  });

  const planStatusId = await requireActiveMasterId(
    db,
    "planStatus",
    MASTER.planStatus.ACTIVE,
  );
  const publishedId = await requireActiveMasterId(
    db,
    "planVersionStatus",
    MASTER.planVersionStatus.PUBLISHED,
  );
  const billingId = await requireActiveMasterId(
    db,
    "billingCycle",
    MASTER.billingCycle.MONTHLY,
  );
  const plan = await db.plan.upsert({
    where: { productId_code: { productId: product.id, code: "STANDARD" } },
    create: {
      productId: product.id,
      code: "STANDARD",
      name: "Standard",
      description: `${LOGIN_TEST_MARKER} plan`,
      sortOrder: 1,
      statusId: planStatusId,
    },
    update: { statusId: planStatusId },
  });
  let version = await db.planVersion.findFirst({
    where: { planId: plan.id, versionNumber: 1 },
  });
  if (!version) {
    version = await db.planVersion.create({
      data: {
        planId: plan.id,
        versionNumber: 1,
        statusId: publishedId,
        billingCycleDefaultId: billingId,
        priceAmount: 990,
        currency: "THB",
        trialDays: 14,
        publishedAt: new Date(),
      },
    });
  }
  return { product, plan, version };
}

async function ensureHrSubscription(
  db: PrismaClient,
  organizationId: string,
  product: { id: string; code: string },
  plan: { id: string; code: string; name: string },
  version: {
    id: string;
    versionNumber: number;
    priceAmount: { toString(): string };
    currency: string;
  },
) {
  const activeIds = await db.subscriptionStatus.findMany({
    where: {
      code: {
        in: [
          MASTER.subscriptionStatus.TRIAL,
          MASTER.subscriptionStatus.ACTIVE,
        ],
      },
    },
    select: { id: true },
  });
  const existing = await db.subscription.findFirst({
    where: {
      organizationId,
      productId: product.id,
      statusId: { in: activeIds.map((s) => s.id) },
    },
  });
  if (existing) {
    await generateEntitlementsForSubscription(db, existing.id);
    return existing;
  }

  const billingCycleId = await requireActiveMasterId(
    db,
    "billingCycle",
    MASTER.billingCycle.MONTHLY,
  );
  const statusId = await requireActiveMasterId(
    db,
    "subscriptionStatus",
    MASTER.subscriptionStatus.ACTIVE,
  );
  const snapshot = buildSubscriptionSnapshot({
    product: { code: product.code },
    plan: { code: plan.code, name: plan.name },
    planVersion: {
      versionNumber: version.versionNumber,
      priceAmount: version.priceAmount as never,
      currency: version.currency,
    },
    billingCycleCode: MASTER.billingCycle.MONTHLY,
    featureCodes: catalogFeaturesForProduct(product.code).map((f) => f.code),
    limits: { loginTest: true },
  });

  const subscription = await db.subscription.create({
    data: {
      organizationId,
      productId: product.id,
      planId: plan.id,
      planVersionId: version.id,
      statusId,
      billingCycleId,
      planCode: plan.code,
      planVersionNumber: version.versionNumber,
      priceAmount: version.priceAmount as never,
      currency: version.currency,
      snapshotJson: snapshot,
      startsAt: new Date(),
      externalRef: `login-test:${organizationId}:${product.code}`,
    },
  });
  await generateEntitlementsForSubscription(db, subscription.id);
  return subscription;
}

async function ensureAuthUser(
  auth: StaffAuthPort,
  person: LoginTestPerson,
): Promise<{ authUserId: string; email: string }> {
  const existing = await auth.getUserByEmail(person.email);
  if (existing) {
    await auth.setPassword({
      authUserId: existing.authUserId,
      password: LOGIN_TEST_PASSWORD,
    });
    if (auth.updateUserPhone) {
      await auth.updateUserPhone({
        authUserId: existing.authUserId,
        phone: `+66${person.phone.slice(1)}`,
      }).catch(() => undefined);
    }
    return existing;
  }
  const phoneE164 = `+66${person.phone.slice(1)}`;
  try {
    return await auth.createUser({
      email: person.email,
      displayName: person.displayName,
      password: LOGIN_TEST_PASSWORD,
      phone: phoneE164,
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
        password: LOGIN_TEST_PASSWORD,
      });
      return again;
    }
    // Phone conflict / unsupported — create email-only, still set known password.
    try {
      return await auth.createUser({
        email: person.email,
        displayName: person.displayName,
        password: LOGIN_TEST_PASSWORD,
      });
    } catch (retryError) {
      if (
        retryError instanceof StaffAuthError &&
        retryError.code === "STAFF_AUTH_ALREADY_EXISTS"
      ) {
        const again = await auth.getUserByEmail(person.email);
        if (!again) throw retryError;
        await auth.setPassword({
          authUserId: again.authUserId,
          password: LOGIN_TEST_PASSWORD,
        });
        return again;
      }
      throw retryError;
    }
  }
}

export async function seedLoginTestDataset(
  db: PrismaClient,
  options: { auth?: StaffAuthPort } = {},
): Promise<LoginTestSeedResult> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("login-test seed forbidden in production");
  }

  const auth = options.auth ?? createStaffAuthAdapter();
  const orgStatusId = await requireActiveMasterId(
    db,
    "organizationStatus",
    MASTER.organizationStatus.ACTIVE,
  );
  const branchStatusId = await requireActiveMasterId(
    db,
    "branchStatus",
    MASTER.branchStatus.ACTIVE,
  );
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

  const organization = await db.organization.upsert({
    where: { customerCode: LOGIN_TEST_ORG_CODE },
    create: {
      customerCode: LOGIN_TEST_ORG_CODE,
      slug: LOGIN_TEST_ORG_SLUG,
      displayName: "แพลูกแพรว",
      legalName: "บริษัท แพลูกแพรว จำกัด",
      nameEn: `Plukpraew (${LOGIN_TEST_MARKER})`,
      address: LOGIN_TEST_MARKER,
      taxId: LOGIN_TEST_TAX_ID,
      statusId: orgStatusId,
    },
    update: {
      displayName: "แพลูกแพรว",
      legalName: "บริษัท แพลูกแพรว จำกัด",
      nameEn: `Plukpraew (${LOGIN_TEST_MARKER})`,
      address: LOGIN_TEST_MARKER,
      taxId: LOGIN_TEST_TAX_ID,
      statusId: orgStatusId,
      deletedAt: null,
    },
  });

  const branchDefs = [
    { code: "HQ" as const, name: "สำนักงานใหญ่" },
    { code: "BRANCH01" as const, name: "สาขาพระราม 9" },
  ];
  const branches: Array<{ id: string; code: string; name: string }> = [];
  for (const def of branchDefs) {
    const row = await db.branch.upsert({
      where: {
        organizationId_code: {
          organizationId: organization.id,
          code: def.code,
        },
      },
      create: {
        organizationId: organization.id,
        code: def.code,
        name: def.name,
        statusId: branchStatusId,
      },
      update: {
        name: def.name,
        statusId: branchStatusId,
        deletedAt: null,
      },
    });
    branches.push({ id: row.id, code: row.code, name: row.name });
  }
  const branchByCode = Object.fromEntries(
    branches.map((b) => [b.code, b]),
  ) as Record<LoginTestBranchCode, { id: string; code: string; name: string }>;

  const ownerRole = await db.organizationRole.findFirst({
    where: {
      code: MASTER.organizationRole.OWNER,
      organizationId: null,
      isSystem: true,
    },
  });
  const adminRole = await db.organizationRole.findFirst({
    where: {
      code: MASTER.organizationRole.ADMIN,
      organizationId: null,
      isSystem: true,
    },
  });
  const branchManagerRole = await db.organizationRole.findFirst({
    where: {
      code: MASTER.organizationRole.BRANCH_MANAGER,
      organizationId: null,
      isSystem: true,
    },
  });
  if (!ownerRole || !adminRole) {
    throw new Error("System OWNER/ADMIN organization roles are missing");
  }
  if (!branchManagerRole) {
    throw new Error(
      "System BRANCH_MANAGER organization role is missing — run seed:masters",
    );
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
        description: LOGIN_TEST_MARKER,
        isSystem: false,
        isActive: true,
        sortOrder: 200,
      },
    });
  }

  // Explicit RBAC for self-service menus in Customer App (also auto-granted
  // via resolveEffectivePermissions when org has hr.access).
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
    select: { id: true, code: true },
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

  const { product, plan, version } = await ensureHrProduct(db);
  await ensureHrSubscription(db, organization.id, product, plan, version);

  const users: LoginTestSeedResult["users"] = [];

  for (const person of LOGIN_TEST_ROSTER) {
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

    // Known password must work immediately — close any open reset windows.
    await db.userPasswordReset.deleteMany({
      where: {
        userProfileId: profile.id,
        consumedAt: null,
        cancelledAt: null,
      },
    });

    let membership = await db.organizationMembership.findUnique({
      where: {
        organizationId_userProfileId: {
          organizationId: organization.id,
          userProfileId: profile.id,
        },
      },
    });
    if (!membership) {
      membership = await db.organizationMembership.create({
        data: {
          organizationId: organization.id,
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

    const roleId =
      person.orgRole === "OWNER"
        ? ownerRole.id
        : person.orgRole === "ADMIN"
          ? adminRole.id
          : person.orgRole === "BRANCH_MANAGER"
            ? branchManagerRole.id
            : employeeRole.id;

    // Keep a single org role per login-test user (replace stale EMPLOYEE, etc.).
    await db.organizationMembershipRole.deleteMany({
      where: { membershipId: membership.id },
    });
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
    if (person.branchCode === "ALL") {
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
          branchId: branchByCode[person.branchCode].id,
          statusId: assignmentActiveId,
        },
      });
    }

    users.push({
      key: person.key,
      email: person.email,
      password: LOGIN_TEST_PASSWORD,
      displayName: person.displayName,
      orgRole: person.orgRole,
      branchCode: person.branchCode,
      authUserId: authUser.authUserId,
      platformUserId: profile.id,
      employeeCode: person.employeeCode,
      scenario: person.scenario,
    });
  }

  return {
    organizationId: organization.id,
    organizationCode: LOGIN_TEST_ORG_CODE,
    organizationName: "แพลูกแพรว",
    branches,
    users,
  };
}

export async function cleanupLoginTestDataset(
  db: PrismaClient,
  options: { dryRun?: boolean; auth?: StaffAuthPort } = {},
): Promise<{
  dryRun: boolean;
  deleted: boolean;
  organizationId: string | null;
  authUsersDeleted: number;
  counts: Record<string, number>;
}> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("login-test cleanup forbidden in production");
  }

  const org = await db.organization.findFirst({
    where: {
      customerCode: LOGIN_TEST_ORG_CODE,
      OR: [
        { address: LOGIN_TEST_MARKER },
        { taxId: LOGIN_TEST_TAX_ID },
        { nameEn: { contains: LOGIN_TEST_MARKER } },
      ],
    },
    select: { id: true, customerCode: true },
  });

  if (!org || org.customerCode.toUpperCase().includes("GOLDENSOFT")) {
    return {
      dryRun: Boolean(options.dryRun),
      deleted: false,
      organizationId: null,
      authUsersDeleted: 0,
      counts: {},
    };
  }

  const memberships = await db.organizationMembership.findMany({
    where: { organizationId: org.id },
    select: {
      userProfileId: true,
      userProfile: { select: { id: true, authUserId: true, email: true } },
    },
  });

  const counts = {
    organizations: 1,
    memberships: memberships.length,
    branches: await db.branch.count({ where: { organizationId: org.id } }),
    subscriptions: await db.subscription.count({
      where: { organizationId: org.id },
    }),
    entitlements: await db.entitlement.count({
      where: { organizationId: org.id },
    }),
    profiles: memberships.length,
  };

  if (options.dryRun) {
    return {
      dryRun: true,
      deleted: false,
      organizationId: org.id,
      authUsersDeleted: 0,
      counts,
    };
  }

  const auth = options.auth ?? createStaffAuthAdapter();
  let authUsersDeleted = 0;
  const rosterEmails = new Set(
    LOGIN_TEST_ROSTER.map((p) => p.email.toLowerCase()),
  );

  await db.$transaction(async (tx) => {
    await tx.userPasswordReset.deleteMany({
      where: {
        userProfileId: { in: memberships.map((m) => m.userProfileId) },
      },
    });
    await tx.entitlement.deleteMany({ where: { organizationId: org.id } });
    await tx.subscription.deleteMany({ where: { organizationId: org.id } });
    await tx.organizationMembership.deleteMany({
      where: { organizationId: org.id },
    });
    await tx.organizationRole.deleteMany({
      where: { organizationId: org.id, isSystem: false },
    });
    await tx.branch.deleteMany({ where: { organizationId: org.id } });
    await tx.auditLog.deleteMany({ where: { organizationId: org.id } });
    await tx.organizationOnboarding.deleteMany({
      where: { organizationId: org.id },
    });
    await tx.organization.delete({ where: { id: org.id } });

    // Soft-delete only profiles created for this roster (by email).
    for (const m of memberships) {
      const email = m.userProfile.email?.toLowerCase() ?? "";
      if (!rosterEmails.has(email)) continue;
      await tx.userProfile.update({
        where: { id: m.userProfile.id },
        data: { deletedAt: new Date() },
      });
    }
  });

  for (const m of memberships) {
    const email = m.userProfile.email?.toLowerCase() ?? "";
    if (!rosterEmails.has(email) || !m.userProfile.authUserId) continue;
    try {
      if (auth.deleteUser) {
        await auth.deleteUser({ authUserId: m.userProfile.authUserId });
      } else {
        await auth.setPassword({
          authUserId: m.userProfile.authUserId,
          password: `revoked-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
      }
      authUsersDeleted += 1;
    } catch {
      // Best-effort — DB cleanup already done.
    }
  }

  return {
    dryRun: false,
    deleted: true,
    organizationId: org.id,
    authUsersDeleted,
    counts,
  };
}
