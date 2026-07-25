import type { BillingCycle, PrismaClient, SubscriptionStatus } from "@prisma/client";

import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/context/types";
import { buildSubscriptionSnapshot } from "@/lib/platform/snapshot";
import { withIdempotency } from "@/lib/platform/idempotency";

export async function createSubscription(
  db: PrismaClient,
  input: {
    organizationId: string;
    productCode: string;
    planCode: string;
    billingCycle: BillingCycle;
    status?: SubscriptionStatus;
    actorAuthUserId: string;
    idempotencyKey: string;
    limits?: Record<string, number | boolean | string>;
  },
) {
  return withIdempotency(db, {
    scope: "subscription.create",
    key: input.idempotencyKey,
    request: {
      organizationId: input.organizationId,
      productCode: input.productCode,
      planCode: input.planCode,
      billingCycle: input.billingCycle,
    },
    execute: async () => {
      return db.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
          where: { code: input.productCode },
        });
        if (!product) throw new Error("Product not found");

        const plan = await tx.plan.findUnique({
          where: {
            productId_code: { productId: product.id, code: input.planCode },
          },
        });
        if (!plan) throw new Error("Plan not found");

        const planVersion = await tx.planVersion.findFirst({
          where: { planId: plan.id, status: "PUBLISHED" },
          orderBy: { versionNumber: "desc" },
          include: {
            features: { include: { feature: true } },
          },
        });
        if (!planVersion) throw new Error("Published plan version not found");

        const existing = await tx.subscription.findFirst({
          where: {
            organizationId: input.organizationId,
            productId: product.id,
            status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
          },
        });
        if (existing) {
          throw new Error(
            "Active subscription already exists for this organization and product",
          );
        }

        const featureCodes = planVersion.features.map((f) => f.feature.code);
        const limitsFromPlan: Record<string, number | boolean | string> = {};
        for (const row of planVersion.features) {
          if (row.limitValue) {
            const asNumber = Number(row.limitValue);
            limitsFromPlan[row.feature.code] = Number.isFinite(asNumber)
              ? asNumber
              : row.limitValue;
          }
        }

        const snapshot = buildSubscriptionSnapshot({
          product,
          plan,
          planVersion,
          billingCycle: input.billingCycle,
          featureCodes,
          limits: { ...limitsFromPlan, ...(input.limits ?? {}) },
        });

        const subscription = await tx.subscription.create({
          data: {
            organizationId: input.organizationId,
            productId: product.id,
            planId: plan.id,
            planVersionId: planVersion.id,
            status: input.status ?? "ACTIVE",
            billingCycle: input.billingCycle,
            planCode: plan.code,
            planVersionNumber: planVersion.versionNumber,
            priceAmount: planVersion.priceAmount,
            currency: planVersion.currency,
            snapshotJson: JSON.stringify(snapshot),
            startsAt: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId: input.organizationId,
            actorAuthUserId: input.actorAuthUserId,
            action: "subscription.create",
            entityType: "Subscription",
            entityId: subscription.id,
            afterJson: JSON.stringify({
              productCode: product.code,
              planCode: plan.code,
              snapshot,
            }),
          },
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: "Subscription",
            aggregateId: subscription.id,
            eventType: "subscription.changed",
            organizationId: input.organizationId,
            payloadJson: JSON.stringify({
              organizationId: input.organizationId,
              productCode: product.code,
              subscriptionId: subscription.id,
            }),
            idempotencyKey: `subscription.changed:${subscription.id}:create`,
          },
        });

        return {
          subscriptionId: subscription.id,
          snapshot,
        };
      });
    },
  });
}

export async function assertCannotMutateSnapshot(
  db: PrismaClient,
  subscriptionId: string,
  nextSnapshotJson: string,
): Promise<void> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!sub) throw new Error("Subscription not found");
  if (sub.snapshotJson !== nextSnapshotJson) {
    throw new Error(
      "Plan feature snapshot cannot be changed after activation",
    );
  }
}
