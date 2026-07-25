import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { requireSafeEnvironment } from "../src/lib/env/guard";
import { buildSubscriptionSnapshot } from "../src/lib/platform/snapshot";

requireSafeEnvironment();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const AUTH = {
  superAdmin: "11111111-1111-4111-8111-111111111111",
  orgAAll: "22222222-2222-4222-8222-222222222222",
  orgABm: "33333333-3333-4333-8333-333333333333",
  orgBAdmin: "44444444-4444-4444-8444-444444444444",
} as const;

async function upsertProduct(code: string, name: string) {
  return prisma.product.upsert({
    where: { code },
    create: { code, name, status: "ACTIVE" },
    update: { name, status: "ACTIVE" },
  });
}

async function main() {
  const admin = await prisma.userProfile.upsert({
    where: { authUserId: AUTH.superAdmin },
    create: {
      authUserId: AUTH.superAdmin,
      email: "superadmin@goldensoft.local",
      displayName: "Platform Super Admin",
      status: "ACTIVE",
    },
    update: { status: "ACTIVE" },
  });

  const existingRole = await prisma.platformRoleAssignment.findFirst({
    where: { userProfileId: admin.id, role: "SUPER_ADMIN", status: "ACTIVE" },
  });
  if (!existingRole) {
    await prisma.platformRoleAssignment.create({
      data: {
        userProfileId: admin.id,
        role: "SUPER_ADMIN",
        assignedByAuthUserId: admin.authUserId,
      },
    });
  }

  const resident = await upsertProduct("RESIDENT", "Resident V2");
  const hr = await upsertProduct("HR", "HR");
  await upsertProduct("QRSTATION", "QR Station");

  for (const f of [
    { productId: resident.id, code: "resident.booking.create", name: "Create booking" },
    { productId: resident.id, code: "resident.payment.approve", name: "Approve payment" },
    { productId: hr.id, code: "hr.employee.read", name: "Read employees" },
    { productId: hr.id, code: "hr.payroll.approve", name: "Approve payroll" },
  ]) {
    await prisma.feature.upsert({
      where: { code: f.code },
      create: { ...f, status: "ACTIVE" },
      update: { name: f.name, status: "ACTIVE" },
    });
  }

  async function ensureHrPlan(
    code: string,
    name: string,
    price: number,
  ) {
    const plan = await prisma.plan.upsert({
      where: { productId_code: { productId: hr.id, code } },
      create: { productId: hr.id, code, name, status: "ACTIVE" },
      update: { name, status: "ACTIVE" },
    });

    let version = await prisma.planVersion.findUnique({
      where: { planId_versionNumber: { planId: plan.id, versionNumber: 1 } },
    });
    if (!version) {
      version = await prisma.planVersion.create({
        data: {
          planId: plan.id,
          versionNumber: 1,
          status: "PUBLISHED",
          billingCycleDefault: "MONTHLY",
          priceAmount: price,
          currency: "THB",
          publishedAt: new Date(),
        },
      });
    }

    for (const feature of await prisma.feature.findMany({ where: { productId: hr.id } })) {
      await prisma.planVersionFeature.upsert({
        where: {
          planVersionId_featureId: {
            planVersionId: version.id,
            featureId: feature.id,
          },
        },
        create: { planVersionId: version.id, featureId: feature.id },
        update: {},
      });
    }

    return { plan, version };
  }

  const hrStandard = await ensureHrPlan("STANDARD", "HR Standard", 1990);
  await ensureHrPlan("ADVANCED", "HR Advanced", 3990);
  await ensureHrPlan("PROFESSIONAL", "HR Professional", 7990);

  const residentPlan = await prisma.plan.upsert({
    where: { productId_code: { productId: resident.id, code: "STANDARD" } },
    create: {
      productId: resident.id,
      code: "STANDARD",
      name: "Resident Standard",
      status: "ACTIVE",
    },
    update: { status: "ACTIVE" },
  });
  let residentVersion = await prisma.planVersion.findUnique({
    where: { planId_versionNumber: { planId: residentPlan.id, versionNumber: 1 } },
  });
  if (!residentVersion) {
    residentVersion = await prisma.planVersion.create({
      data: {
        planId: residentPlan.id,
        versionNumber: 1,
        status: "PUBLISHED",
        billingCycleDefault: "MONTHLY",
        priceAmount: 4990,
        currency: "THB",
        publishedAt: new Date(),
      },
    });
  }

  const orgA = await prisma.organization.upsert({
    where: { slug: "org-a" },
    create: {
      customerCode: "CUST-A",
      slug: "org-a",
      legalName: "Organization A Co., Ltd.",
      displayName: "Organization A",
      status: "ACTIVE",
    },
    update: { status: "ACTIVE" },
  });
  const orgB = await prisma.organization.upsert({
    where: { slug: "org-b" },
    create: {
      customerCode: "CUST-B",
      slug: "org-b",
      legalName: "Organization B Co., Ltd.",
      displayName: "Organization B",
      status: "ACTIVE",
    },
    update: { status: "ACTIVE" },
  });

  async function ensureBranches(organizationId: string, codes: string[]) {
    const ids: string[] = [];
    for (const code of codes) {
      const existing = await prisma.branch.findUnique({
        where: { organizationId_code: { organizationId, code } },
      });
      if (existing) ids.push(existing.id);
      else {
        const created = await prisma.branch.create({
          data: { organizationId, code, name: `Branch ${code}`, status: "ACTIVE" },
        });
        ids.push(created.id);
      }
    }
    return ids;
  }

  const orgABranches = await ensureBranches(orgA.id, ["A1", "A2", "A3"]);
  await ensureBranches(orgB.id, ["B1", "B2", "B3", "B4", "B5"]);

  async function ensureSubscription(
    organizationId: string,
    productId: string,
    productCode: string,
    plan: { id: string; code: string; name: string },
    version: { id: string; versionNumber: number; priceAmount: { toString(): string }; currency: string },
  ) {
    const existing = await prisma.subscription.findFirst({
      where: {
        organizationId,
        productId,
        status: { in: ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"] },
      },
    });
    if (existing) return existing;

    const features = await prisma.planVersionFeature.findMany({
      where: { planVersionId: version.id },
      include: { feature: true },
    });
    const snapshot = buildSubscriptionSnapshot({
      product: { code: productCode },
      plan: { code: plan.code, name: plan.name },
      planVersion: {
        versionNumber: version.versionNumber,
        priceAmount: version.priceAmount as never,
        currency: version.currency,
      },
      billingCycle: "MONTHLY",
      featureCodes: features.map((f) => f.feature.code),
      limits: {
        maxUsers: 50,
        maxEmployees: 100,
        maxBranches: 10,
        maxRooms: 40,
        maxStations: 5,
        maxDevices: 20,
      },
    });

    return prisma.subscription.create({
      data: {
        organizationId,
        productId,
        planId: plan.id,
        planVersionId: version.id,
        status: "ACTIVE",
        billingCycle: "MONTHLY",
        planCode: plan.code,
        planVersionNumber: version.versionNumber,
        priceAmount: version.priceAmount as never,
        currency: version.currency,
        snapshotJson: snapshot,
        startsAt: new Date(),
      },
    });
  }

  await ensureSubscription(orgA.id, resident.id, "RESIDENT", residentPlan, residentVersion);
  await ensureSubscription(orgA.id, hr.id, "HR", hrStandard.plan, hrStandard.version);
  await ensureSubscription(orgB.id, hr.id, "HR", hrStandard.plan, hrStandard.version);

  console.log("Seed completed", { orgABranches: orgABranches.length });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
