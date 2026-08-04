/**
 * Full QA suite dataset — 2 orgs × 2 branches × 10 people each.
 *
 * Password for every Auth user: `11111111`
 * Cleanup removes only TEST-ALPHA / TEST-BETA — never GOLDENSOFT.
 *
 * Mirror roster keys with goldensoft-hr/src/lib/seed/full-qa-dataset.ts
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

export const FULL_QA_PASSWORD = "11111111";
export const FULL_QA_MARKER = "full-qa-suite";
export const FULL_QA_ORG_CODES = ["TEST-ALPHA", "TEST-BETA"] as const;

export type FullQaBranchCode = "HQ" | "B2";
export type FullQaOrgRole =
  | "OWNER"
  | "ADMIN"
  | "BRANCH_MANAGER"
  | "EMPLOYEE";

export type FullQaPerson = {
  key: string;
  orgCode: (typeof FULL_QA_ORG_CODES)[number];
  employeeCode: string;
  email: string;
  phone: string;
  firstNameTh: string;
  lastNameTh: string;
  displayName: string;
  orgRole: FullQaOrgRole;
  branchCode: FullQaBranchCode | "ALL";
  /** HR home branch (OWNER/ADMIN live on HQ). */
  homeBranch: FullQaBranchCode;
  positionCode: string;
  scenario: string;
  /** Attendance / leave / advance fixture tag. */
  fixture:
    | "normal"
    | "late"
    | "absent"
    | "leave"
    | "advance"
    | "night"
    | "viewer";
};

type OrgDef = {
  code: (typeof FULL_QA_ORG_CODES)[number];
  slug: string;
  displayName: string;
  legalName: string;
  emailPrefix: "a" | "b";
  phoneBase: number;
  branches: Array<{ code: FullQaBranchCode; name: string }>;
};

export const FULL_QA_ORG_DEFS: readonly OrgDef[] = [
  {
    code: "TEST-ALPHA",
    slug: "test-alpha",
    displayName: "อัลฟ่า",
    legalName: "บริษัท อัลฟ่า จำกัด",
    emailPrefix: "a",
    phoneBase: 810_000_001,
    branches: [
      { code: "HQ", name: "สำนักงานใหญ่" },
      { code: "B2", name: "สาขาบางนา" },
    ],
  },
  {
    code: "TEST-BETA",
    slug: "test-beta",
    displayName: "เบต้า",
    legalName: "บริษัท เบต้า จำกัด",
    emailPrefix: "b",
    phoneBase: 820_000_001,
    branches: [
      { code: "HQ", name: "สำนักงานใหญ่" },
      { code: "B2", name: "สาขาลาดพร้าว" },
    ],
  },
] as const;

const NAME_POOL: Array<[string, string]> = [
  ["สมชาย", "ใจดี"],
  ["สมหญิง", "รักงาน"],
  ["วิชัย", "ขยันงาน"],
  ["นภา", "สุขใจ"],
  ["ประยุทธ์", "มั่นคง"],
  ["ศิริพร", "ยิ้มแย้ม"],
  ["อนุชา", "ตรงเวลา"],
  ["จิราภรณ์", "พัฒนา"],
  ["ธนา", "รุ่งเรือง"],
  ["วราภรณ์", "เพียรดี"],
  ["เมธา", "สุจริต"],
  ["ปิยะ", "ก้าวหน้า"],
  ["กมล", "ตั้งใจ"],
  ["รัตนา", "สดใส"],
  ["ชัยวัฒน์", "อดทน"],
  ["อรุณี", "ใจเย็น"],
  ["พิมพ์ใจ", "รักดี"],
  ["ณัฐพล", "ขยัน"],
  ["สุภาพร", "มั่นใจ"],
  ["เกรียงไกร", "องอาจ"],
];

function buildOrgRoster(org: OrgDef): FullQaPerson[] {
  const p = org.emailPrefix;
  const phone = (n: number) => String(org.phoneBase + n - 1).padStart(10, "0");
  const name = (i: number) => NAME_POOL[(i - 1) % NAME_POOL.length]!;
  const emp = (seq: number) =>
    `${org.code === "TEST-ALPHA" ? "A" : "B"}${String(seq).padStart(2, "0")}`;

  const rows: Array<Omit<FullQaPerson, "orgCode" | "displayName">> = [
    // —— HQ (10) ——
    {
      key: `${p}-owner`,
      employeeCode: emp(1),
      email: `${p}.owner@ex.com`,
      phone: phone(1),
      firstNameTh: name(1)[0],
      lastNameTh: name(1)[1],
      orgRole: "OWNER",
      branchCode: "ALL",
      homeBranch: "HQ",
      positionCode: "OWNER",
      scenario: "เจ้าขององค์กร — สิทธิ์ครบ",
      fixture: "normal",
    },
    {
      key: `${p}-admin`,
      employeeCode: emp(2),
      email: `${p}.admin@ex.com`,
      phone: phone(2),
      firstNameTh: name(2)[0],
      lastNameTh: name(2)[1],
      orgRole: "ADMIN",
      branchCode: "ALL",
      homeBranch: "HQ",
      positionCode: "ORG_ADMIN",
      scenario: "ผู้ดูแลระบบองค์กร",
      fixture: "normal",
    },
    {
      key: `${p}-hq-mgr`,
      employeeCode: emp(3),
      email: `${p}.hq.mgr@ex.com`,
      phone: phone(3),
      firstNameTh: name(3)[0],
      lastNameTh: name(3)[1],
      orgRole: "BRANCH_MANAGER",
      branchCode: "HQ",
      homeBranch: "HQ",
      positionCode: "BR_MGR",
      scenario: "ผู้ดูแลระบบประจำสาขา HQ",
      fixture: "normal",
    },
    {
      key: `${p}-hq-view`,
      employeeCode: emp(4),
      email: `${p}.hq.view@ex.com`,
      phone: phone(4),
      firstNameTh: name(4)[0],
      lastNameTh: name(4)[1],
      orgRole: "EMPLOYEE",
      branchCode: "HQ",
      homeBranch: "HQ",
      positionCode: "BR_VIEW",
      scenario: "ผู้ดูระบบประจำสาขา HQ",
      fixture: "viewer",
    },
    {
      key: `${p}-hq-e5`,
      employeeCode: emp(5),
      email: `${p}.hq.e5@ex.com`,
      phone: phone(5),
      firstNameTh: name(5)[0],
      lastNameTh: name(5)[1],
      orgRole: "EMPLOYEE",
      branchCode: "HQ",
      homeBranch: "HQ",
      positionCode: "SUPERVISOR",
      scenario: "หัวหน้างาน — มาสายบ่อย",
      fixture: "late",
    },
    {
      key: `${p}-hq-e6`,
      employeeCode: emp(6),
      email: `${p}.hq.e6@ex.com`,
      phone: phone(6),
      firstNameTh: name(6)[0],
      lastNameTh: name(6)[1],
      orgRole: "EMPLOYEE",
      branchCode: "HQ",
      homeBranch: "HQ",
      positionCode: "HR_STAFF",
      scenario: "เจ้าหน้าที่บุคคล — มีวันลา",
      fixture: "leave",
    },
    {
      key: `${p}-hq-e7`,
      employeeCode: emp(7),
      email: `${p}.hq.e7@ex.com`,
      phone: phone(7),
      firstNameTh: name(7)[0],
      lastNameTh: name(7)[1],
      orgRole: "EMPLOYEE",
      branchCode: "HQ",
      homeBranch: "HQ",
      positionCode: "ACCOUNTANT",
      scenario: "บัญชี — ขาดงาน",
      fixture: "absent",
    },
    {
      key: `${p}-hq-e8`,
      employeeCode: emp(8),
      email: `${p}.hq.e8@ex.com`,
      phone: phone(8),
      firstNameTh: name(8)[0],
      lastNameTh: name(8)[1],
      orgRole: "EMPLOYEE",
      branchCode: "HQ",
      homeBranch: "HQ",
      positionCode: "STAFF",
      scenario: "พนักงาน — เบิกล่วงหน้า",
      fixture: "advance",
    },
    {
      key: `${p}-hq-e9`,
      employeeCode: emp(9),
      email: `${p}.hq.e9@ex.com`,
      phone: phone(9),
      firstNameTh: name(9)[0],
      lastNameTh: name(9)[1],
      orgRole: "EMPLOYEE",
      branchCode: "HQ",
      homeBranch: "HQ",
      positionCode: "CASHIER",
      scenario: "แคชเชียร์ — มาตรงเวลา",
      fixture: "normal",
    },
    {
      key: `${p}-hq-e10`,
      employeeCode: emp(10),
      email: `${p}.hq.e10@ex.com`,
      phone: phone(10),
      firstNameTh: name(10)[0],
      lastNameTh: name(10)[1],
      orgRole: "EMPLOYEE",
      branchCode: "HQ",
      homeBranch: "HQ",
      positionCode: "STAFF",
      scenario: "พนักงาน HQ — ปกติ",
      fixture: "normal",
    },
    // —— B2 (10) ——
    {
      key: `${p}-b2-mgr`,
      employeeCode: emp(11),
      email: `${p}.b2.mgr@ex.com`,
      phone: phone(11),
      firstNameTh: name(11)[0],
      lastNameTh: name(11)[1],
      orgRole: "BRANCH_MANAGER",
      branchCode: "B2",
      homeBranch: "B2",
      positionCode: "BR_MGR",
      scenario: "ผู้ดูแลระบบประจำสาขา B2",
      fixture: "normal",
    },
    {
      key: `${p}-b2-view`,
      employeeCode: emp(12),
      email: `${p}.b2.view@ex.com`,
      phone: phone(12),
      firstNameTh: name(12)[0],
      lastNameTh: name(12)[1],
      orgRole: "EMPLOYEE",
      branchCode: "B2",
      homeBranch: "B2",
      positionCode: "BR_VIEW",
      scenario: "ผู้ดูระบบประจำสาขา B2",
      fixture: "viewer",
    },
    {
      key: `${p}-b2-e13`,
      employeeCode: emp(13),
      email: `${p}.b2.e13@ex.com`,
      phone: phone(13),
      firstNameTh: name(13)[0],
      lastNameTh: name(13)[1],
      orgRole: "EMPLOYEE",
      branchCode: "B2",
      homeBranch: "B2",
      positionCode: "SUPERVISOR",
      scenario: "หัวหน้างานสาขา — มาสาย",
      fixture: "late",
    },
    {
      key: `${p}-b2-e14`,
      employeeCode: emp(14),
      email: `${p}.b2.e14@ex.com`,
      phone: phone(14),
      firstNameTh: name(14)[0],
      lastNameTh: name(14)[1],
      orgRole: "EMPLOYEE",
      branchCode: "B2",
      homeBranch: "B2",
      positionCode: "DRIVER",
      scenario: "พนักงานขับรถ — กะกลางคืน / สาย",
      fixture: "night",
    },
    {
      key: `${p}-b2-e15`,
      employeeCode: emp(15),
      email: `${p}.b2.e15@ex.com`,
      phone: phone(15),
      firstNameTh: name(15)[0],
      lastNameTh: name(15)[1],
      orgRole: "EMPLOYEE",
      branchCode: "B2",
      homeBranch: "B2",
      positionCode: "STAFF",
      scenario: "พนักงานสาขา — ขาดงาน",
      fixture: "absent",
    },
    {
      key: `${p}-b2-e16`,
      employeeCode: emp(16),
      email: `${p}.b2.e16@ex.com`,
      phone: phone(16),
      firstNameTh: name(16)[0],
      lastNameTh: name(16)[1],
      orgRole: "EMPLOYEE",
      branchCode: "B2",
      homeBranch: "B2",
      positionCode: "STAFF",
      scenario: "พนักงานสาขา — ลา",
      fixture: "leave",
    },
    {
      key: `${p}-b2-e17`,
      employeeCode: emp(17),
      email: `${p}.b2.e17@ex.com`,
      phone: phone(17),
      firstNameTh: name(17)[0],
      lastNameTh: name(17)[1],
      orgRole: "EMPLOYEE",
      branchCode: "B2",
      homeBranch: "B2",
      positionCode: "CASHIER",
      scenario: "แคชเชียร์สาขา — เบิกล่วงหน้า",
      fixture: "advance",
    },
    {
      key: `${p}-b2-e18`,
      employeeCode: emp(18),
      email: `${p}.b2.e18@ex.com`,
      phone: phone(18),
      firstNameTh: name(18)[0],
      lastNameTh: name(18)[1],
      orgRole: "EMPLOYEE",
      branchCode: "B2",
      homeBranch: "B2",
      positionCode: "STAFF",
      scenario: "พนักงานสาขา — ปกติ",
      fixture: "normal",
    },
    {
      key: `${p}-b2-e19`,
      employeeCode: emp(19),
      email: `${p}.b2.e19@ex.com`,
      phone: phone(19),
      firstNameTh: name(19)[0],
      lastNameTh: name(19)[1],
      orgRole: "EMPLOYEE",
      branchCode: "B2",
      homeBranch: "B2",
      positionCode: "STAFF",
      scenario: "พนักงานสาขา — ปกติ",
      fixture: "normal",
    },
    {
      key: `${p}-b2-e20`,
      employeeCode: emp(20),
      email: `${p}.b2.e20@ex.com`,
      phone: phone(20),
      firstNameTh: name(20)[0],
      lastNameTh: name(20)[1],
      orgRole: "EMPLOYEE",
      branchCode: "B2",
      homeBranch: "B2",
      positionCode: "STAFF",
      scenario: "พนักงานสาขา — ปกติ",
      fixture: "normal",
    },
  ];

  return rows.map((row) => ({
    ...row,
    orgCode: org.code,
    displayName: `${row.firstNameTh} ${row.lastNameTh}`,
  }));
}

export const FULL_QA_ROSTER: readonly FullQaPerson[] = FULL_QA_ORG_DEFS.flatMap(
  (org) => buildOrgRoster(org),
);

export type FullQaSeedResult = {
  organizations: Array<{
    id: string;
    code: string;
    name: string;
    branches: Array<{ id: string; code: string; name: string }>;
  }>;
  password: string;
  users: Array<{
    key: string;
    orgCode: string;
    email: string;
    password: string;
    displayName: string;
    orgRole: string;
    branchCode: string;
    homeBranch: string;
    employeeCode: string;
    positionCode: string;
    scenario: string;
    authUserId: string;
    platformUserId: string;
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
      description: `${FULL_QA_MARKER} plan`,
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
    limits: { fullQa: true },
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
      externalRef: `full-qa:${organizationId}:${product.code}`,
    },
  });
  await generateEntitlementsForSubscription(db, subscription.id);
  return subscription;
}

async function ensureAuthUser(
  auth: StaffAuthPort,
  person: FullQaPerson,
): Promise<{ authUserId: string; email: string }> {
  const existing = await auth.getUserByEmail(person.email);
  if (existing) {
    await auth.setPassword({
      authUserId: existing.authUserId,
      password: FULL_QA_PASSWORD,
    });
    return existing;
  }
  try {
    return await auth.createUser({
      email: person.email,
      displayName: person.displayName,
      password: FULL_QA_PASSWORD,
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
        password: FULL_QA_PASSWORD,
      });
      return again;
    }
    throw error;
  }
}

async function seedOneOrg(
  db: PrismaClient,
  auth: StaffAuthPort,
  orgDef: OrgDef,
  catalog: Awaited<ReturnType<typeof ensureHrProduct>>,
  masters: {
    orgStatusId: string;
    branchStatusId: string;
    profileActiveId: string;
    membershipActiveId: string;
    assignmentActiveId: string;
    allBranchesScopeId: string;
    selectedScopeId: string;
    ownerRoleId: string;
    adminRoleId: string;
    branchManagerRoleId: string;
  },
): Promise<FullQaSeedResult["organizations"][number] & {
  users: FullQaSeedResult["users"];
}> {
  const organization = await db.organization.upsert({
    where: { customerCode: orgDef.code },
    create: {
      customerCode: orgDef.code,
      slug: orgDef.slug,
      displayName: orgDef.displayName,
      legalName: orgDef.legalName,
      nameEn: `${orgDef.slug} (${FULL_QA_MARKER})`,
      address: FULL_QA_MARKER,
      taxId: orgDef.code,
      statusId: masters.orgStatusId,
    },
    update: {
      displayName: orgDef.displayName,
      legalName: orgDef.legalName,
      nameEn: `${orgDef.slug} (${FULL_QA_MARKER})`,
      address: FULL_QA_MARKER,
      taxId: orgDef.code,
      statusId: masters.orgStatusId,
      deletedAt: null,
    },
  });

  const branches: Array<{ id: string; code: string; name: string }> = [];
  for (const def of orgDef.branches) {
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
        statusId: masters.branchStatusId,
        isPrimary: def.code === "HQ",
      },
      update: {
        name: def.name,
        statusId: masters.branchStatusId,
        deletedAt: null,
        isPrimary: def.code === "HQ",
      },
    });
    branches.push({ id: row.id, code: row.code, name: row.name });
  }
  const branchByCode = Object.fromEntries(
    branches.map((b) => [b.code, b]),
  ) as Record<FullQaBranchCode, { id: string; code: string; name: string }>;

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
        description: FULL_QA_MARKER,
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

  await ensureHrSubscription(
    db,
    organization.id,
    catalog.product,
    catalog.plan,
    catalog.version,
  );

  const roster = FULL_QA_ROSTER.filter((r) => r.orgCode === orgDef.code);
  const users: FullQaSeedResult["users"] = [];

  for (const person of roster) {
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
          statusId: masters.profileActiveId,
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
          statusId: masters.profileActiveId,
          deletedAt: null,
        },
      });
    }

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
          statusId: masters.membershipActiveId,
          joinedAt: new Date(),
        },
      });
    } else {
      membership = await db.organizationMembership.update({
        where: { id: membership.id },
        data: { statusId: masters.membershipActiveId },
      });
    }

    const roleId =
      person.orgRole === "OWNER"
        ? masters.ownerRoleId
        : person.orgRole === "ADMIN"
          ? masters.adminRoleId
          : person.orgRole === "BRANCH_MANAGER"
            ? masters.branchManagerRoleId
            : employeeRole.id;

    await db.organizationMembershipRole.deleteMany({
      where: { membershipId: membership.id },
    });
    await db.organizationMembershipRole.create({
      data: {
        membershipId: membership.id,
        roleId,
        statusId: masters.assignmentActiveId,
      },
    });

    await db.organizationMembershipBranchScope.deleteMany({
      where: { membershipId: membership.id },
    });
    if (person.branchCode === "ALL") {
      await db.organizationMembershipBranchScope.create({
        data: {
          membershipId: membership.id,
          scopeTypeId: masters.allBranchesScopeId,
          statusId: masters.assignmentActiveId,
        },
      });
    } else {
      await db.organizationMembershipBranchScope.create({
        data: {
          membershipId: membership.id,
          scopeTypeId: masters.selectedScopeId,
          branchId: branchByCode[person.branchCode].id,
          statusId: masters.assignmentActiveId,
        },
      });
    }

    users.push({
      key: person.key,
      orgCode: person.orgCode,
      email: person.email,
      password: FULL_QA_PASSWORD,
      displayName: person.displayName,
      orgRole: person.orgRole,
      branchCode: person.branchCode,
      homeBranch: person.homeBranch,
      employeeCode: person.employeeCode,
      positionCode: person.positionCode,
      scenario: person.scenario,
      authUserId: authUser.authUserId,
      platformUserId: profile.id,
    });
  }

  return {
    id: organization.id,
    code: orgDef.code,
    name: orgDef.displayName,
    branches,
    users,
  };
}

export async function seedFullQaDataset(
  db: PrismaClient,
  options: { auth?: StaffAuthPort } = {},
): Promise<FullQaSeedResult> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("full-qa seed forbidden in production");
  }

  const auth = options.auth ?? createStaffAuthAdapter();
  const [
    orgStatusId,
    branchStatusId,
    profileActiveId,
    membershipActiveId,
    assignmentActiveId,
    allBranchesScopeId,
    selectedScopeId,
  ] = await Promise.all([
    requireActiveMasterId(db, "organizationStatus", MASTER.organizationStatus.ACTIVE),
    requireActiveMasterId(db, "branchStatus", MASTER.branchStatus.ACTIVE),
    requireActiveMasterId(db, "userProfileStatus", MASTER.userProfileStatus.ACTIVE),
    requireActiveMasterId(db, "membershipStatus", MASTER.membershipStatus.ACTIVE),
    requireActiveMasterId(db, "assignmentStatus", MASTER.assignmentStatus.ACTIVE),
    requireActiveMasterId(db, "branchScopeType", MASTER.branchScopeType.ALL_BRANCHES),
    requireActiveMasterId(db, "branchScopeType", MASTER.branchScopeType.SELECTED),
  ]);

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
  if (!ownerRole || !adminRole || !branchManagerRole) {
    throw new Error("System OWNER/ADMIN/BRANCH_MANAGER roles missing — run masters seed");
  }

  const catalog = await ensureHrProduct(db);
  const masters = {
    orgStatusId,
    branchStatusId,
    profileActiveId,
    membershipActiveId,
    assignmentActiveId,
    allBranchesScopeId,
    selectedScopeId,
    ownerRoleId: ownerRole.id,
    adminRoleId: adminRole.id,
    branchManagerRoleId: branchManagerRole.id,
  };

  const organizations: FullQaSeedResult["organizations"] = [];
  const users: FullQaSeedResult["users"] = [];

  for (const orgDef of FULL_QA_ORG_DEFS) {
    const seeded = await seedOneOrg(db, auth, orgDef, catalog, masters);
    organizations.push({
      id: seeded.id,
      code: seeded.code,
      name: seeded.name,
      branches: seeded.branches,
    });
    users.push(...seeded.users);
  }

  return { organizations, password: FULL_QA_PASSWORD, users };
}

export async function cleanupFullQaDataset(
  db: PrismaClient,
  options: { dryRun?: boolean; auth?: StaffAuthPort } = {},
): Promise<{
  dryRun: boolean;
  deletedOrgs: string[];
  authUsersDeleted: number;
  counts: Record<string, number>;
}> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("full-qa cleanup forbidden in production");
  }

  const orgs = await db.organization.findMany({
    where: {
      customerCode: { in: [...FULL_QA_ORG_CODES] },
      OR: [
        { address: FULL_QA_MARKER },
        { taxId: { in: [...FULL_QA_ORG_CODES] } },
        { nameEn: { contains: FULL_QA_MARKER } },
      ],
    },
    select: { id: true, customerCode: true },
  });

  const safeOrgs = orgs.filter(
    (o) => !o.customerCode.toUpperCase().includes("GOLDENSOFT"),
  );
  if (safeOrgs.length === 0) {
    return {
      dryRun: Boolean(options.dryRun),
      deletedOrgs: [],
      authUsersDeleted: 0,
      counts: {},
    };
  }

  const orgIds = safeOrgs.map((o) => o.id);
  const memberships = await db.organizationMembership.findMany({
    where: { organizationId: { in: orgIds } },
    select: {
      userProfileId: true,
      userProfile: { select: { id: true, authUserId: true, email: true } },
    },
  });
  const rosterEmails = new Set(
    FULL_QA_ROSTER.map((p) => p.email.toLowerCase()),
  );
  const counts = {
    organizations: safeOrgs.length,
    memberships: memberships.length,
    branches: await db.branch.count({ where: { organizationId: { in: orgIds } } }),
    subscriptions: await db.subscription.count({
      where: { organizationId: { in: orgIds } },
    }),
  };

  if (options.dryRun) {
    return {
      dryRun: true,
      deletedOrgs: safeOrgs.map((o) => o.customerCode),
      authUsersDeleted: 0,
      counts,
    };
  }

  const auth = options.auth ?? createStaffAuthAdapter();
  let authUsersDeleted = 0;

  await db.$transaction(async (tx) => {
    await tx.userPasswordReset.deleteMany({
      where: {
        userProfileId: { in: memberships.map((m) => m.userProfileId) },
      },
    });
    await tx.entitlement.deleteMany({ where: { organizationId: { in: orgIds } } });
    await tx.subscription.deleteMany({ where: { organizationId: { in: orgIds } } });
    await tx.organizationMembership.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await tx.organizationRole.deleteMany({
      where: { organizationId: { in: orgIds }, isSystem: false },
    });
    await tx.branch.deleteMany({ where: { organizationId: { in: orgIds } } });
    await tx.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
    await tx.organizationOnboarding.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await tx.organization.deleteMany({ where: { id: { in: orgIds } } });

    for (const m of memberships) {
      const email = m.userProfile.email?.toLowerCase() ?? "";
      if (!rosterEmails.has(email)) continue;
      await tx.userProfile.update({
        where: { id: m.userProfile.id },
        data: { deletedAt: new Date() },
      });
    }
  });

  const seenAuth = new Set<string>();
  for (const m of memberships) {
    const email = m.userProfile.email?.toLowerCase() ?? "";
    const authUserId = m.userProfile.authUserId;
    if (!rosterEmails.has(email) || !authUserId || seenAuth.has(authUserId)) {
      continue;
    }
    seenAuth.add(authUserId);
    try {
      if (auth.deleteUser) {
        await auth.deleteUser({ authUserId });
      } else {
        await auth.setPassword({
          authUserId,
          password: `revoked-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
      }
      authUsersDeleted += 1;
    } catch {
      // best-effort
    }
  }

  return {
    dryRun: false,
    deletedOrgs: safeOrgs.map((o) => o.customerCode),
    authUsersDeleted,
    counts,
  };
}
