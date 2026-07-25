import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  ContextError,
  resolveApplicationContext,
} from "../src/lib/context/resolve-application-context";
import {
  bootstrapOrganization,
  revokeOrganizationRole,
} from "../src/lib/platform/organization-bootstrap";
import {
  assertCannotMutateSnapshot,
  createSubscription,
} from "../src/lib/platform/subscriptions";
import { buildSubscriptionSnapshot } from "../src/lib/platform/snapshot";
import { createTestPrisma, resetTestDatabase } from "./helpers/test-db";
import type { PrismaClient } from "@prisma/client";

let db: PrismaClient;

async function seedCatalog() {
  const hr = await db.product.create({
    data: { code: "HR", name: "HR", status: "ACTIVE" },
  });
  const resident = await db.product.create({
    data: { code: "RESIDENT", name: "Resident", status: "ACTIVE" },
  });
  const feature = await db.feature.create({
    data: {
      productId: hr.id,
      code: "hr.employee.read",
      name: "Read employees",
      status: "ACTIVE",
    },
  });
  const plan = await db.plan.create({
    data: {
      productId: hr.id,
      code: "STANDARD",
      name: "HR Standard",
      status: "ACTIVE",
    },
  });
  const version = await db.planVersion.create({
    data: {
      planId: plan.id,
      versionNumber: 1,
      status: "PUBLISHED",
      billingCycleDefault: "MONTHLY",
      priceAmount: 1990,
      currency: "THB",
      publishedAt: new Date(),
    },
  });
  await db.planVersionFeature.create({
    data: { planVersionId: version.id, featureId: feature.id, limitValue: "50" },
  });

  const residentPlan = await db.plan.create({
    data: {
      productId: resident.id,
      code: "STANDARD",
      name: "Resident Standard",
      status: "ACTIVE",
    },
  });
  const residentVersion = await db.planVersion.create({
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

  return { hr, resident, plan, version, residentPlan, residentVersion, feature };
}

describe("Platform tenant isolation and bootstrap", () => {
  before(async () => {
    resetTestDatabase();
    db = createTestPrisma();
  });

  it("bootstraps organization with OWNER and is idempotent", async () => {
    const first = await bootstrapOrganization(db, {
      customerCode: "CUST-A",
      slug: "org-a",
      legalName: "Organization A",
      displayName: "Organization A",
      ownerAuthUserId: "auth-owner-a",
      ownerEmail: "owner-a@test.local",
      ownerDisplayName: "Owner A",
      initialBranch: { code: "A1", name: "Branch A1" },
      idempotencyKey: "boot-org-a",
      actorAuthUserId: "auth-super-admin",
    });
    assert.equal(first.reused, false);

    const second = await bootstrapOrganization(db, {
      customerCode: "CUST-A",
      slug: "org-a",
      legalName: "Organization A",
      displayName: "Organization A",
      ownerAuthUserId: "auth-owner-a",
      ownerEmail: "owner-a@test.local",
      ownerDisplayName: "Owner A",
      initialBranch: { code: "A1", name: "Branch A1" },
      idempotencyKey: "boot-org-a",
      actorAuthUserId: "auth-super-admin",
    });
    assert.equal(second.reused, true);
    assert.equal(second.result.organizationId, first.result.organizationId);

    const owners = await db.organizationMembershipRole.count({
      where: {
        role: "OWNER",
        status: "ACTIVE",
        membership: { organizationId: first.result.organizationId },
      },
    });
    assert.equal(owners, 1);
  });

  it("rejects revoking the last OWNER", async () => {
    const org = await db.organization.findUniqueOrThrow({
      where: { slug: "org-a" },
    });
    const ownerRole = await db.organizationMembershipRole.findFirstOrThrow({
      where: {
        role: "OWNER",
        status: "ACTIVE",
        membership: { organizationId: org.id },
      },
    });

    await assert.rejects(
      () =>
        revokeOrganizationRole(db, {
          membershipRoleId: ownerRole.id,
          actorAuthUserId: "auth-super-admin",
        }),
      /last active OWNER/,
    );
  });

  it("isolates organizations and branch scopes", async () => {
    const catalog = await seedCatalog();

    const orgB = await bootstrapOrganization(db, {
      customerCode: "CUST-B",
      slug: "org-b",
      legalName: "Organization B",
      displayName: "Organization B",
      ownerAuthUserId: "auth-owner-b",
      ownerEmail: "owner-b@test.local",
      ownerDisplayName: "Owner B",
      initialBranch: { code: "B1", name: "Branch B1" },
      idempotencyKey: "boot-org-b",
      actorAuthUserId: "auth-super-admin",
    });

    const orgA = await db.organization.findUniqueOrThrow({
      where: { slug: "org-a" },
    });
    const branchA2 = await db.branch.create({
      data: {
        organizationId: orgA.id,
        code: "A2",
        name: "Branch A2",
        status: "ACTIVE",
      },
    });
    const branchA1 = await db.branch.findFirstOrThrow({
      where: { organizationId: orgA.id, code: "A1" },
    });

    await createSubscription(db, {
      organizationId: orgA.id,
      productCode: "HR",
      planCode: "STANDARD",
      billingCycle: "MONTHLY",
      actorAuthUserId: "auth-super-admin",
      idempotencyKey: "sub-a-hr",
      limits: { maxEmployees: 50 },
    });
    await createSubscription(db, {
      organizationId: orgB.result.organizationId,
      productCode: "HR",
      planCode: "STANDARD",
      billingCycle: "MONTHLY",
      actorAuthUserId: "auth-super-admin",
      idempotencyKey: "sub-b-hr",
    });

    const bm = await db.userProfile.create({
      data: {
        authUserId: "auth-bm-a",
        email: "bm-a@test.local",
        displayName: "Branch Manager A",
        status: "ACTIVE",
      },
    });
    const membership = await db.organizationMembership.create({
      data: {
        organizationId: orgA.id,
        userProfileId: bm.id,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
    await db.organizationMembershipRole.create({
      data: { membershipId: membership.id, role: "ADMIN", status: "ACTIVE" },
    });
    await db.organizationMembershipBranchScope.create({
      data: {
        membershipId: membership.id,
        scopeType: "SELECTED",
        branchId: branchA1.id,
        status: "ACTIVE",
      },
    });
    await db.organizationProductMembership.create({
      data: {
        organizationId: orgA.id,
        membershipId: membership.id,
        userProfileId: bm.id,
        productId: catalog.hr.id,
        status: "ACTIVE",
      },
    });
    await db.userPreference.create({
      data: {
        userProfileId: bm.id,
        lastOrganizationId: orgA.id,
        lastBranchId: branchA1.id,
      },
    });

    const ctx = await resolveApplicationContext(db, {
      authUserId: "auth-bm-a",
      claimedOrganizationId: orgA.id,
      claimedBranchId: branchA1.id,
      productCode: "HR",
    });
    assert.equal(ctx.organizationId, orgA.id);
    assert.deepEqual(ctx.accessibleBranchIds, [branchA1.id]);
    assert.ok(!ctx.accessibleBranchIds.includes(branchA2.id));

    await assert.rejects(
      () =>
        resolveApplicationContext(db, {
          authUserId: "auth-bm-a",
          claimedOrganizationId: orgB.result.organizationId,
          productCode: "HR",
        }),
      (error: unknown) =>
        error instanceof ContextError && error.code === "ORG_FORBIDDEN",
    );

    await assert.rejects(
      () =>
        resolveApplicationContext(db, {
          authUserId: "auth-bm-a",
          claimedOrganizationId: orgA.id,
          claimedBranchId: branchA2.id,
          productCode: "HR",
        }),
      (error: unknown) =>
        error instanceof ContextError && error.code === "BRANCH_FORBIDDEN",
    );

    await assert.rejects(
      () =>
        resolveApplicationContext(db, {
          authUserId: "auth-bm-a",
          claimedOrganizationId: orgA.id,
          clientOrganizationId: orgB.result.organizationId,
          productCode: "HR",
        }),
      (error: unknown) =>
        error instanceof ContextError && error.code === "CLIENT_ORG_MISMATCH",
    );
  });

  it("blocks product access without subscription", async () => {
    const orgA = await db.organization.findUniqueOrThrow({
      where: { slug: "org-a" },
    });
    const owner = await db.userProfile.findUniqueOrThrow({
      where: { authUserId: "auth-owner-a" },
    });
    const resident = await db.product.findUniqueOrThrow({
      where: { code: "RESIDENT" },
    });
    const membership = await db.organizationMembership.findUniqueOrThrow({
      where: {
        organizationId_userProfileId: {
          organizationId: orgA.id,
          userProfileId: owner.id,
        },
      },
    });
    await db.organizationProductMembership.create({
      data: {
        organizationId: orgA.id,
        membershipId: membership.id,
        userProfileId: owner.id,
        productId: resident.id,
        status: "ACTIVE",
      },
    });

    await assert.rejects(
      () =>
        resolveApplicationContext(db, {
          authUserId: "auth-owner-a",
          claimedOrganizationId: orgA.id,
          productCode: "RESIDENT",
        }),
      (error: unknown) =>
        error instanceof ContextError && error.code === "SUBSCRIPTION_MISSING",
    );
  });

  it("keeps subscription snapshot immutable", async () => {
    const sub = await db.subscription.findFirstOrThrow({
      where: { planCode: "STANDARD" },
      include: { product: true, plan: true, planVersion: true },
    });
    const mutated = buildSubscriptionSnapshot({
      product: sub.product,
      plan: sub.plan,
      planVersion: sub.planVersion,
      billingCycle: sub.billingCycle,
      featureCodes: ["hr.employee.read", "extra.feature"],
      limits: { maxEmployees: 999 },
    });

    await assert.rejects(
      () => assertCannotMutateSnapshot(db, sub.id, JSON.stringify(mutated)),
      /cannot be changed/,
    );
  });
});
