import { PrismaClient } from "@prisma/client";

import { requireSafeEnvironment } from "../src/lib/env/guard";
import { buildSubscriptionSnapshot } from "../src/lib/platform/snapshot";

requireSafeEnvironment();

const prisma = new PrismaClient();

async function upsertProduct(code: string, name: string) {
  return prisma.product.upsert({
    where: { code },
    create: { code, name, status: "ACTIVE" },
    update: { name, status: "ACTIVE" },
  });
}

async function main() {
  const admin = await prisma.userProfile.upsert({
    where: { authUserId: "auth-super-admin" },
    create: {
      authUserId: "auth-super-admin",
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
  const qr = await upsertProduct("QRSTATION", "QR Station");

  const featureDefs = [
    { productId: resident.id, code: "resident.booking.create", name: "Create booking" },
    { productId: resident.id, code: "resident.payment.approve", name: "Approve payment" },
    { productId: hr.id, code: "hr.employee.read", name: "Read employees" },
    { productId: hr.id, code: "hr.payroll.approve", name: "Approve payroll" },
    { productId: qr.id, code: "qrstation.transaction.read", name: "Read transactions" },
  ];

  for (const f of featureDefs) {
    await prisma.feature.upsert({
      where: { code: f.code },
      create: { ...f, status: "ACTIVE" },
      update: { name: f.name, status: "ACTIVE" },
    });
  }

  async function ensureHrPlan(code: string, name: string, price: number, limits: Record<string, string>) {
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

    const hrFeatures = await prisma.feature.findMany({ where: { productId: hr.id } });
    for (const feature of hrFeatures) {
      await prisma.planVersionFeature.upsert({
        where: {
          planVersionId_featureId: {
            planVersionId: version.id,
            featureId: feature.id,
          },
        },
        create: {
          planVersionId: version.id,
          featureId: feature.id,
          limitValue: limits[feature.code] ?? null,
        },
        update: {},
      });
    }

    return { plan, version };
  }

  const hrStandard = await ensureHrPlan("STANDARD", "HR Standard", 1990, {
    "hr.employee.read": "50",
  });
  await ensureHrPlan("ADVANCED", "HR Advanced", 3990, {
    "hr.employee.read": "200",
  });
  await ensureHrPlan("PROFESSIONAL", "HR Professional", 7990, {
    "hr.employee.read": "1000",
  });

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
  for (const feature of await prisma.feature.findMany({ where: { productId: resident.id } })) {
    await prisma.planVersionFeature.upsert({
      where: {
        planVersionId_featureId: {
          planVersionId: residentVersion.id,
          featureId: feature.id,
        },
      },
      create: { planVersionId: residentVersion.id, featureId: feature.id },
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

  async function ensureBranches(
    organizationId: string,
    codes: string[],
  ) {
    const ids: string[] = [];
    for (const code of codes) {
      const existing = await prisma.branch.findUnique({
        where: { organizationId_code: { organizationId, code } },
      });
      if (existing) {
        ids.push(existing.id);
      } else {
        const created = await prisma.branch.create({
          data: {
            organizationId,
            code,
            name: `Branch ${code}`,
            status: "ACTIVE",
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
    plan: { id: string; code: string; name: string },
    version: { id: string; versionNumber: number; priceAmount: number; currency: string },
    productCode: string,
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
      product: { id: productId, code: productCode, name: productCode, status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
      plan: { id: plan.id, productId, code: plan.code, name: plan.name, status: "ACTIVE", createdAt: new Date(), updatedAt: new Date() },
      planVersion: {
        id: version.id,
        planId: plan.id,
        versionNumber: version.versionNumber,
        status: "PUBLISHED",
        billingCycleDefault: "MONTHLY",
        priceAmount: version.priceAmount,
        currency: version.currency,
        trialDays: null,
        publishedAt: new Date(),
        createdAt: new Date(),
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
        priceAmount: version.priceAmount,
        currency: version.currency,
        snapshotJson: JSON.stringify(snapshot),
        startsAt: new Date(),
      },
    });
  }

  await ensureSubscription(orgA.id, resident.id, residentPlan, residentVersion, "RESIDENT");
  await ensureSubscription(orgA.id, hr.id, hrStandard.plan, hrStandard.version, "HR");
  await ensureSubscription(orgB.id, hr.id, hrStandard.plan, hrStandard.version, "HR");

  const allBranchUser = await prisma.userProfile.upsert({
    where: { authUserId: "auth-org-a-all" },
    create: {
      authUserId: "auth-org-a-all",
      email: "all-branches@org-a.local",
      displayName: "Org A All Branches",
      status: "ACTIVE",
    },
    update: { status: "ACTIVE" },
  });

  const branchManager = await prisma.userProfile.upsert({
    where: { authUserId: "auth-org-a-bm" },
    create: {
      authUserId: "auth-org-a-bm",
      email: "branch-manager@org-a.local",
      displayName: "Org A Branch Manager",
      status: "ACTIVE",
    },
    update: { status: "ACTIVE" },
  });

  async function ensureMembership(
    organizationId: string,
    userProfileId: string,
    role: "OWNER" | "ADMIN",
    scope:
      | { type: "ALL_BRANCHES" }
      | { type: "SELECTED"; branchId: string },
    productIds: string[],
  ) {
    let membership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userProfileId: { organizationId, userProfileId },
      },
    });
    if (!membership) {
      membership = await prisma.organizationMembership.create({
        data: {
          organizationId,
          userProfileId,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });
    }

    const hasRole = await prisma.organizationMembershipRole.findFirst({
      where: { membershipId: membership.id, role, status: "ACTIVE" },
    });
    if (!hasRole) {
      await prisma.organizationMembershipRole.create({
        data: { membershipId: membership.id, role, status: "ACTIVE" },
      });
    }

    const scopes = await prisma.organizationMembershipBranchScope.findMany({
      where: { membershipId: membership.id, status: "ACTIVE" },
    });
    if (scopes.length === 0) {
      await prisma.organizationMembershipBranchScope.create({
        data: {
          membershipId: membership.id,
          scopeType: scope.type,
          branchId: scope.type === "SELECTED" ? scope.branchId : null,
          status: "ACTIVE",
        },
      });
    }

    for (const productId of productIds) {
      await prisma.organizationProductMembership.upsert({
        where: {
          organizationId_userProfileId_productId: {
            organizationId,
            userProfileId,
            productId,
          },
        },
        create: {
          organizationId,
          membershipId: membership.id,
          userProfileId,
          productId,
          status: "ACTIVE",
        },
        update: { status: "ACTIVE" },
      });
    }

    await prisma.userPreference.upsert({
      where: { userProfileId },
      create: {
        userProfileId,
        lastOrganizationId: organizationId,
        lastBranchId: scope.type === "SELECTED" ? scope.branchId : null,
      },
      update: {
        lastOrganizationId: organizationId,
        lastBranchId: scope.type === "SELECTED" ? scope.branchId : null,
      },
    });

    return membership;
  }

  await ensureMembership(
    orgA.id,
    allBranchUser.id,
    "ADMIN",
    { type: "ALL_BRANCHES" },
    [resident.id, hr.id],
  );
  await ensureMembership(
    orgA.id,
    branchManager.id,
    "ADMIN",
    { type: "SELECTED", branchId: orgABranches[0]! },
    [resident.id, hr.id],
  );

  // Org B owner-like user for isolation tests
  const orgBUser = await prisma.userProfile.upsert({
    where: { authUserId: "auth-org-b-admin" },
    create: {
      authUserId: "auth-org-b-admin",
      email: "admin@org-b.local",
      displayName: "Org B Admin",
      status: "ACTIVE",
    },
    update: { status: "ACTIVE" },
  });
  await ensureMembership(orgB.id, orgBUser.id, "OWNER", { type: "ALL_BRANCHES" }, [hr.id]);

  console.log("Seed completed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
