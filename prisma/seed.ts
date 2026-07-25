import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { requireSafeEnvironment } from "../src/lib/env/guard";
import { MASTER } from "../src/lib/platform/master-codes";
import { requireActiveMasterId } from "../src/lib/platform/master-data";
import { buildSubscriptionSnapshot } from "../src/lib/platform/snapshot";
import { seedAllMasters } from "./seed-masters";

requireSafeEnvironment();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const AUTH = {
  superAdmin: "11111111-1111-4111-8111-111111111111",
  orgAAll: "22222222-2222-4222-8222-222222222222",
  orgABm: "33333333-3333-4333-8333-333333333333",
  orgBAdmin: "44444444-4444-4444-8444-444444444444",
} as const;

async function main() {
  await seedAllMasters(prisma);

  const userActiveId = await requireActiveMasterId(
    prisma,
    "userProfileStatus",
    MASTER.userProfileStatus.ACTIVE,
  );
  const platformRoleId = await requireActiveMasterId(
    prisma,
    "platformRole",
    MASTER.platformRole.SUPER_ADMIN,
  );
  const assignmentActiveId = await requireActiveMasterId(
    prisma,
    "assignmentStatus",
    MASTER.assignmentStatus.ACTIVE,
  );
  const orgActiveId = await requireActiveMasterId(
    prisma,
    "organizationStatus",
    MASTER.organizationStatus.ACTIVE,
  );
  const branchActiveId = await requireActiveMasterId(
    prisma,
    "branchStatus",
    MASTER.branchStatus.ACTIVE,
  );
  const membershipActiveId = await requireActiveMasterId(
    prisma,
    "membershipStatus",
    MASTER.membershipStatus.ACTIVE,
  );
  const orgAdminRoleId = await requireActiveMasterId(
    prisma,
    "organizationRole",
    MASTER.organizationRole.ADMIN,
  );
  const orgOwnerRoleId = await requireActiveMasterId(
    prisma,
    "organizationRole",
    MASTER.organizationRole.OWNER,
  );
  const allBranchesId = await requireActiveMasterId(
    prisma,
    "branchScopeType",
    MASTER.branchScopeType.ALL_BRANCHES,
  );
  const selectedScopeId = await requireActiveMasterId(
    prisma,
    "branchScopeType",
    MASTER.branchScopeType.SELECTED,
  );
  const productActiveId = await requireActiveMasterId(
    prisma,
    "productStatus",
    MASTER.productStatus.ACTIVE,
  );
  const featureActiveId = await requireActiveMasterId(
    prisma,
    "featureStatus",
    MASTER.featureStatus.ACTIVE,
  );
  const planActiveId = await requireActiveMasterId(
    prisma,
    "planStatus",
    MASTER.planStatus.ACTIVE,
  );
  const planPublishedId = await requireActiveMasterId(
    prisma,
    "planVersionStatus",
    MASTER.planVersionStatus.PUBLISHED,
  );
  const monthlyId = await requireActiveMasterId(
    prisma,
    "billingCycle",
    MASTER.billingCycle.MONTHLY,
  );
  const subActiveId = await requireActiveMasterId(
    prisma,
    "subscriptionStatus",
    MASTER.subscriptionStatus.ACTIVE,
  );
  const productMemberActiveId = await requireActiveMasterId(
    prisma,
    "productMembershipStatus",
    MASTER.productMembershipStatus.ACTIVE,
  );

  const admin = await prisma.userProfile.upsert({
    where: { authUserId: AUTH.superAdmin },
    create: {
      authUserId: AUTH.superAdmin,
      email: "superadmin@goldensoft.local",
      displayName: "Platform Super Admin",
      statusId: userActiveId,
    },
    update: { statusId: userActiveId },
  });

  const existingRole = await prisma.platformRoleAssignment.findFirst({
    where: {
      userProfileId: admin.id,
      roleId: platformRoleId,
      statusId: assignmentActiveId,
    },
  });
  if (!existingRole) {
    await prisma.platformRoleAssignment.create({
      data: {
        userProfileId: admin.id,
        roleId: platformRoleId,
        statusId: assignmentActiveId,
        assignedByAuthUserId: admin.authUserId,
      },
    });
  }

  async function upsertProduct(code: string, name: string) {
    return prisma.product.upsert({
      where: { code },
      create: { code, name, statusId: productActiveId },
      update: { name, statusId: productActiveId },
    });
  }

  const resident = await upsertProduct("RESIDENT", "Resident V2");
  const hr = await upsertProduct("HR", "HR");
  await upsertProduct("QRSTATION", "QR Station");

  for (const f of [
    { productId: resident.id, code: "resident.booking.create", name: "Create booking" },
    { productId: hr.id, code: "hr.employee.read", name: "Read employees" },
    { productId: hr.id, code: "hr.payroll.approve", name: "Approve payroll" },
  ]) {
    await prisma.feature.upsert({
      where: { code: f.code },
      create: { ...f, statusId: featureActiveId },
      update: { name: f.name, statusId: featureActiveId },
    });
  }

  async function ensurePlan(
    productId: string,
    code: string,
    name: string,
    price: number,
  ) {
    const plan = await prisma.plan.upsert({
      where: { productId_code: { productId, code } },
      create: { productId, code, name, statusId: planActiveId },
      update: { name, statusId: planActiveId },
    });
    let version = await prisma.planVersion.findUnique({
      where: { planId_versionNumber: { planId: plan.id, versionNumber: 1 } },
    });
    if (!version) {
      version = await prisma.planVersion.create({
        data: {
          planId: plan.id,
          versionNumber: 1,
          statusId: planPublishedId,
          billingCycleDefaultId: monthlyId,
          priceAmount: price,
          currency: "THB",
          publishedAt: new Date(),
        },
      });
    }
    return { plan, version };
  }

  const hrStandard = await ensurePlan(hr.id, "STANDARD", "HR Standard", 1990);
  await ensurePlan(hr.id, "ADVANCED", "HR Advanced", 3990);
  await ensurePlan(hr.id, "PROFESSIONAL", "HR Professional", 7990);
  const residentPlan = await ensurePlan(resident.id, "STANDARD", "Resident Standard", 4990);

  for (const feature of await prisma.feature.findMany({ where: { productId: hr.id } })) {
    await prisma.planVersionFeature.upsert({
      where: {
        planVersionId_featureId: {
          planVersionId: hrStandard.version.id,
          featureId: feature.id,
        },
      },
      create: {
        planVersionId: hrStandard.version.id,
        featureId: feature.id,
      },
      update: {},
    });
  }

  const orgA = await prisma.organization.upsert({
    where: { slug: "org-a" },
    create: {
      customerCode: "CUST-A",
      slug: "org-a",
      legalName: "Organization A Co., Ltd.",
      displayName: "Organization A",
      statusId: orgActiveId,
    },
    update: { statusId: orgActiveId },
  });
  const orgB = await prisma.organization.upsert({
    where: { slug: "org-b" },
    create: {
      customerCode: "CUST-B",
      slug: "org-b",
      legalName: "Organization B Co., Ltd.",
      displayName: "Organization B",
      statusId: orgActiveId,
    },
    update: { statusId: orgActiveId },
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
          data: {
            organizationId,
            code,
            name: `Branch ${code}`,
            statusId: branchActiveId,
          },
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
        status: {
          code: { in: ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"] },
        },
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
      billingCycleCode: MASTER.billingCycle.MONTHLY,
      featureCodes: features.map((f) => f.feature.code),
      limits: { maxUsers: 50, maxEmployees: 100, maxBranches: 10 },
    });

    return prisma.subscription.create({
      data: {
        organizationId,
        productId,
        planId: plan.id,
        planVersionId: version.id,
        statusId: subActiveId,
        billingCycleId: monthlyId,
        planCode: plan.code,
        planVersionNumber: version.versionNumber,
        priceAmount: version.priceAmount as never,
        currency: version.currency,
        snapshotJson: snapshot,
        startsAt: new Date(),
      },
    });
  }

  await ensureSubscription(orgA.id, resident.id, "RESIDENT", residentPlan.plan, residentPlan.version);
  await ensureSubscription(orgA.id, hr.id, "HR", hrStandard.plan, hrStandard.version);
  await ensureSubscription(orgB.id, hr.id, "HR", hrStandard.plan, hrStandard.version);

  async function ensureMembership(
    organizationId: string,
    authUserId: string,
    email: string,
    displayName: string,
    roleId: string,
    scopeTypeId: string,
    branchId: string | null,
    productIds: string[],
  ) {
    const user = await prisma.userProfile.upsert({
      where: { authUserId },
      create: { authUserId, email, displayName, statusId: userActiveId },
      update: { statusId: userActiveId },
    });

    let membership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userProfileId: {
          organizationId,
          userProfileId: user.id,
        },
      },
    });
    if (!membership) {
      membership = await prisma.organizationMembership.create({
        data: {
          organizationId,
          userProfileId: user.id,
          statusId: membershipActiveId,
          joinedAt: new Date(),
        },
      });
    }

    const hasRole = await prisma.organizationMembershipRole.findFirst({
      where: {
        membershipId: membership.id,
        roleId,
        statusId: assignmentActiveId,
      },
    });
    if (!hasRole) {
      await prisma.organizationMembershipRole.create({
        data: {
          membershipId: membership.id,
          roleId,
          statusId: assignmentActiveId,
        },
      });
    }

    const scopes = await prisma.organizationMembershipBranchScope.findMany({
      where: { membershipId: membership.id, statusId: assignmentActiveId },
    });
    if (scopes.length === 0) {
      await prisma.organizationMembershipBranchScope.create({
        data: {
          membershipId: membership.id,
          scopeTypeId,
          branchId,
          statusId: assignmentActiveId,
        },
      });
    }

    for (const productId of productIds) {
      await prisma.organizationProductMembership.upsert({
        where: {
          organizationId_userProfileId_productId: {
            organizationId,
            userProfileId: user.id,
            productId,
          },
        },
        create: {
          organizationId,
          membershipId: membership.id,
          userProfileId: user.id,
          productId,
          statusId: productMemberActiveId,
        },
        update: { statusId: productMemberActiveId },
      });
    }

    await prisma.userPreference.upsert({
      where: { userProfileId: user.id },
      create: {
        userProfileId: user.id,
        lastOrganizationId: organizationId,
        lastBranchId: branchId,
      },
      update: {
        lastOrganizationId: organizationId,
        lastBranchId: branchId,
      },
    });
  }

  await ensureMembership(
    orgA.id,
    AUTH.orgAAll,
    "all-branches@org-a.local",
    "Org A All Branches",
    orgAdminRoleId,
    allBranchesId,
    null,
    [resident.id, hr.id],
  );
  await ensureMembership(
    orgA.id,
    AUTH.orgABm,
    "branch-manager@org-a.local",
    "Org A Branch Manager",
    orgAdminRoleId,
    selectedScopeId,
    orgABranches[0]!,
    [resident.id, hr.id],
  );
  await ensureMembership(
    orgB.id,
    AUTH.orgBAdmin,
    "admin@org-b.local",
    "Org B Admin",
    orgOwnerRoleId,
    allBranchesId,
    null,
    [hr.id],
  );

  console.log("Seed completed (masters + demo tenants)");
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
