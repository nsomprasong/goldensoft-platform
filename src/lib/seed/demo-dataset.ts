import type { PrismaClient } from "@prisma/client";

import { MASTER } from "@/lib/platform/master-codes";
import { requireActiveMasterId } from "@/lib/platform/master-data";
import { buildSubscriptionSnapshot } from "@/lib/platform/snapshot";
import {
  catalogFeaturesForProduct,
  generateEntitlementsForSubscription,
} from "@/lib/platform/entitlements";
import { resolveSeedMode } from "@/lib/seed/seed-mode";

/** Demo org markers — cleanup only deletes these codes. Never GOLDENSOFT. */
export const DEMO_ORG_CODES = [
  "RESORT-DEMO",
  "COMPANY-DEMO",
  "STATION-DEMO",
] as const;

export const DEMO_MARKER = "ข้อมูลตัวอย่าง";

const DEMO_CUSTOM_ROLES = [
  { code: "BRANCH_MANAGER_DEMO", nameTh: "ผู้จัดการสาขา", nameEn: "Branch manager" },
  { code: "HR_STAFF_DEMO", nameTh: "เจ้าหน้าที่บุคคล", nameEn: "HR staff" },
  { code: "ACCOUNTING_DEMO", nameTh: "เจ้าหน้าที่บัญชี", nameEn: "Accounting" },
  { code: "AUDITOR_DEMO", nameTh: "ผู้ตรวจสอบ", nameEn: "Auditor" },
  { code: "STAFF_DEMO", nameTh: "พนักงานทั่วไป", nameEn: "General staff" },
] as const;

async function ensureProduct(
  db: PrismaClient,
  code: string,
  nameTh: string,
  nameEn: string,
) {
  const statusId = await requireActiveMasterId(
    db,
    "productStatus",
    MASTER.productStatus.ACTIVE,
  );
  return db.product.upsert({
    where: { code },
    create: {
      code,
      name: nameTh,
      nameTh,
      nameEn,
      productType: "APPLICATION",
      sortOrder: 10,
      statusId,
    },
    update: {
      name: nameTh,
      nameTh,
      nameEn,
      statusId,
    },
  });
}

async function ensurePlanWithVersion(
  db: PrismaClient,
  productId: string,
  code: string,
  name: string,
  price: number,
) {
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
    where: { productId_code: { productId, code } },
    create: {
      productId,
      code,
      name,
      description: `${DEMO_MARKER} plan`,
      sortOrder: 1,
      statusId: planStatusId,
    },
    update: { name, statusId: planStatusId },
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
        priceAmount: price,
        currency: "THB",
        trialDays: 14,
        publishedAt: new Date(),
      },
    });
  }
  return { plan, version };
}

async function ensureOrg(
  db: PrismaClient,
  input: {
    customerCode: string;
    slug: string;
    displayName: string;
    legalName: string;
  },
) {
  const statusId = await requireActiveMasterId(
    db,
    "organizationStatus",
    MASTER.organizationStatus.ACTIVE,
  );
  return db.organization.upsert({
    where: { customerCode: input.customerCode },
    create: {
      customerCode: input.customerCode,
      slug: input.slug,
      displayName: input.displayName,
      legalName: input.legalName,
      nameEn: `${DEMO_MARKER} ${input.customerCode}`,
      address: DEMO_MARKER,
      taxId: `DEMO-${input.customerCode}`,
      statusId,
    },
    update: {
      displayName: input.displayName,
      legalName: input.legalName,
      nameEn: `${DEMO_MARKER} ${input.customerCode}`,
      address: DEMO_MARKER,
      taxId: `DEMO-${input.customerCode}`,
      statusId,
      deletedAt: null,
    },
  });
}

async function ensureBranches(
  db: PrismaClient,
  organizationId: string,
  codes: string[],
) {
  const statusId = await requireActiveMasterId(
    db,
    "branchStatus",
    MASTER.branchStatus.ACTIVE,
  );
  const ids: string[] = [];
  for (const code of codes) {
    const existing = await db.branch.findUnique({
      where: { organizationId_code: { organizationId, code } },
    });
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const created = await db.branch.create({
      data: {
        organizationId,
        code,
        name: `${DEMO_MARKER} ${code}`,
        statusId,
      },
    });
    ids.push(created.id);
  }
  return ids;
}

async function ensureCustomRoles(db: PrismaClient, organizationId: string) {
  const roles = [];
  for (const [index, role] of DEMO_CUSTOM_ROLES.entries()) {
    const existing = await db.organizationRole.findFirst({
      where: { organizationId, code: role.code },
    });
    if (existing) {
      roles.push(existing);
      continue;
    }
    const created = await db.organizationRole.create({
      data: {
        organizationId,
        code: role.code,
        nameTh: role.nameTh,
        nameEn: role.nameEn,
        description: DEMO_MARKER,
        isSystem: false,
        isActive: true,
        sortOrder: 100 + index,
      },
    });
    roles.push(created);
  }
  return roles;
}

async function ensureDemoSubscription(
  db: PrismaClient,
  input: {
    organizationId: string;
    product: { id: string; code: string };
    plan: { id: string; code: string; name: string };
    version: {
      id: string;
      versionNumber: number;
      priceAmount: { toString(): string };
      currency: string;
    };
    statusCode: string;
  },
) {
  const activeIds = await db.subscriptionStatus.findMany({
    where: {
      code: {
        in: [
          MASTER.subscriptionStatus.TRIAL,
          MASTER.subscriptionStatus.ACTIVE,
          MASTER.subscriptionStatus.SUSPENDED,
          MASTER.subscriptionStatus.PAST_DUE,
        ],
      },
    },
    select: { id: true },
  });
  const existing = await db.subscription.findFirst({
    where: {
      organizationId: input.organizationId,
      productId: input.product.id,
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
    input.statusCode,
  );
  const snapshot = buildSubscriptionSnapshot({
    product: { code: input.product.code },
    plan: { code: input.plan.code, name: input.plan.name },
    planVersion: {
      versionNumber: input.version.versionNumber,
      priceAmount: input.version.priceAmount as never,
      currency: input.version.currency,
    },
    billingCycleCode: MASTER.billingCycle.MONTHLY,
    featureCodes: catalogFeaturesForProduct(input.product.code).map(
      (f) => f.code,
    ),
    limits: { demo: true },
  });

  const subscription = await db.subscription.create({
    data: {
      organizationId: input.organizationId,
      productId: input.product.id,
      planId: input.plan.id,
      planVersionId: input.version.id,
      statusId,
      billingCycleId,
      planCode: input.plan.code,
      planVersionNumber: input.version.versionNumber,
      priceAmount: input.version.priceAmount as never,
      currency: input.version.currency,
      snapshotJson: snapshot,
      startsAt: new Date(),
      externalRef: `demo:${input.organizationId}:${input.product.code}`,
    },
  });
  await generateEntitlementsForSubscription(db, subscription.id);
  return subscription;
}

export async function seedDevelopmentDemo(db: PrismaClient) {
  const mode = resolveSeedMode();
  if (mode !== "development-demo") {
    throw new Error(`seedDevelopmentDemo requires SEED_MODE=development-demo (got ${mode})`);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("development-demo seed forbidden in production");
  }

  const resident = await ensureProduct(
    db,
    "RESIDENT_V2",
    "Resident V2",
    "Resident V2",
  );
  const hr = await ensureProduct(
    db,
    "GOLDENSOFT_HR",
    "GoldenSoft HR",
    "GoldenSoft HR",
  );
  const qr = await ensureProduct(db, "QRSTATION", "QR Station", "QR Station");

  const residentPlan = await ensurePlanWithVersion(
    db,
    resident.id,
    "STANDARD",
    "Standard",
    2990,
  );
  const hrPlan = await ensurePlanWithVersion(db, hr.id, "STANDARD", "Standard", 990);
  const qrPlan = await ensurePlanWithVersion(db, qr.id, "STANDARD", "Standard", 490);

  const resort = await ensureOrg(db, {
    customerCode: "RESORT-DEMO",
    slug: "resort-demo",
    displayName: `รีสอร์ทตัวอย่าง (${DEMO_MARKER})`,
    legalName: `DEMO Legal รีสอร์ทตัวอย่าง`,
  });
  const company = await ensureOrg(db, {
    customerCode: "COMPANY-DEMO",
    slug: "company-demo",
    displayName: `บริษัทตัวอย่าง (${DEMO_MARKER})`,
    legalName: `DEMO Legal บริษัทตัวอย่าง`,
  });
  const station = await ensureOrg(db, {
    customerCode: "STATION-DEMO",
    slug: "station-demo",
    displayName: `สถานีบริการตัวอย่าง (${DEMO_MARKER})`,
    legalName: `DEMO Legal สถานีบริการตัวอย่าง`,
  });

  await ensureBranches(db, resort.id, ["MAIN", "BEACH", "SPA"]);
  await ensureBranches(db, company.id, ["HQ", "BRANCH2"]);
  await ensureBranches(db, station.id, ["PUMP1", "PUMP2", "SHOP"]);

  await ensureCustomRoles(db, resort.id);
  await ensureCustomRoles(db, company.id);
  await ensureCustomRoles(db, station.id);

  await ensureDemoSubscription(db, {
    organizationId: resort.id,
    product: resident,
    plan: residentPlan.plan,
    version: residentPlan.version,
    statusCode: MASTER.subscriptionStatus.ACTIVE,
  });
  await ensureDemoSubscription(db, {
    organizationId: resort.id,
    product: hr,
    plan: hrPlan.plan,
    version: hrPlan.version,
    statusCode: MASTER.subscriptionStatus.TRIAL,
  });
  await ensureDemoSubscription(db, {
    organizationId: company.id,
    product: hr,
    plan: hrPlan.plan,
    version: hrPlan.version,
    statusCode: MASTER.subscriptionStatus.ACTIVE,
  });
  await ensureDemoSubscription(db, {
    organizationId: station.id,
    product: qr,
    plan: qrPlan.plan,
    version: qrPlan.version,
    statusCode: MASTER.subscriptionStatus.SUSPENDED,
  });
  await ensureDemoSubscription(db, {
    organizationId: station.id,
    product: hr,
    plan: hrPlan.plan,
    version: hrPlan.version,
    statusCode: MASTER.subscriptionStatus.ACTIVE,
  });

  // Mock invitation records (no Auth send)
  const inviteStatusId = await requireActiveMasterId(
    db,
    "userInvitationStatus",
    MASTER.userInvitationStatus.PENDING,
  );
  const ownerRole = await db.organizationRole.findFirst({
    where: {
      code: MASTER.organizationRole.OWNER,
      organizationId: null,
      isSystem: true,
    },
  });
  const allBranches = await db.branchScopeType.findUnique({
    where: { code: MASTER.branchScopeType.ALL_BRANCHES },
  });
  const anyProfile = await db.userProfile.findFirst({
    where: { deletedAt: null },
    select: { id: true },
  });
  if (ownerRole && allBranches && anyProfile) {
    for (const org of [resort, company, station]) {
      const key = `demo-invite:${org.customerCode}`;
      const existing = await db.userInvitation.findFirst({
        where: { idempotencyKey: key },
      });
      if (!existing) {
        await db.userInvitation.create({
          data: {
            emailNormalized: `demo+${org.customerCode.toLowerCase()}@example.invalid`,
            displayName: `${DEMO_MARKER} ผู้รับเชิญ`,
            organizationId: org.id,
            organizationRoleId: ownerRole.id,
            branchScopeTypeId: allBranches.id,
            branchIdsJson: [],
            statusId: inviteStatusId,
            isActive: true,
            invitedByProfileId: anyProfile.id,
            idempotencyKey: key,
            lastErrorCode: "DEMO_MOCK_NO_SEND",
          },
        });
      }
    }
  }

  const audit = await db.auditActionType.upsert({
    where: { code: "organization.onboard" },
    create: {
      code: "organization.onboard",
      nameTh: "เริ่มใช้งานองค์กรใหม่",
      nameEn: "Onboard organization",
      sortOrder: 95,
      isActive: true,
      isSystem: true,
    },
    update: {},
  });
  for (const org of [resort, company, station]) {
    await db.auditLog.create({
      data: {
        organizationId: org.id,
        actionTypeId: audit.id,
        entityType: "Organization",
        entityId: org.id,
        afterJson: { demo: true, marker: DEMO_MARKER },
      },
    });
  }

  return {
    organizations: DEMO_ORG_CODES.slice(),
  };
}

export async function cleanupDevelopmentDemo(
  db: PrismaClient,
  options: { dryRun: boolean },
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("demo cleanup forbidden in production");
  }

  const orgs = await db.organization.findMany({
    where: {
      customerCode: { in: [...DEMO_ORG_CODES] },
      OR: [
        { address: DEMO_MARKER },
        { nameEn: { contains: DEMO_MARKER } },
        { taxId: { startsWith: "DEMO-" } },
      ],
    },
    select: { id: true, customerCode: true },
  });

  // Hard safety: never touch GOLDENSOFT
  const safeOrgs = orgs.filter(
    (o) =>
      !o.customerCode.toUpperCase().includes("GOLDENSOFT") &&
      DEMO_ORG_CODES.includes(o.customerCode as (typeof DEMO_ORG_CODES)[number]),
  );

  const orgIds = safeOrgs.map((o) => o.id);
  const counts = {
    organizations: safeOrgs.length,
    subscriptions: 0,
    entitlements: 0,
    branches: 0,
    memberships: 0,
    invitations: 0,
    customRoles: 0,
    audits: 0,
  };

  if (orgIds.length === 0) {
    return { dryRun: options.dryRun, counts, deleted: false };
  }

  counts.subscriptions = await db.subscription.count({
    where: { organizationId: { in: orgIds } },
  });
  counts.entitlements = await db.entitlement.count({
    where: { organizationId: { in: orgIds } },
  });
  counts.branches = await db.branch.count({
    where: { organizationId: { in: orgIds } },
  });
  counts.memberships = await db.organizationMembership.count({
    where: { organizationId: { in: orgIds } },
  });
  counts.invitations = await db.userInvitation.count({
    where: { organizationId: { in: orgIds } },
  });
  counts.customRoles = await db.organizationRole.count({
    where: { organizationId: { in: orgIds }, isSystem: false },
  });
  counts.audits = await db.auditLog.count({
    where: { organizationId: { in: orgIds } },
  });

  if (options.dryRun) {
    return { dryRun: true, counts, deleted: false, organizations: safeOrgs };
  }

  await db.$transaction(async (tx) => {
    await tx.entitlement.deleteMany({ where: { organizationId: { in: orgIds } } });
    await tx.subscription.deleteMany({ where: { organizationId: { in: orgIds } } });
    await tx.userInvitation.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
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
  });

  return { dryRun: false, counts, deleted: true, organizations: safeOrgs };
}
