import type { PrismaClient } from "@prisma/client";

import {
  ACTIVE_SUBSCRIPTION_STATUS_CODES,
} from "@/lib/platform/master-codes";
import { MASTER } from "@/lib/platform/master-codes";
import { requireActiveMasterId } from "@/lib/platform/master-data";
import { buildSubscriptionSnapshot } from "@/lib/platform/snapshot";
import { withIdempotency } from "@/lib/platform/idempotency";

export async function createSubscription(
  db: PrismaClient,
  input: {
    organizationId: string;
    productCode: string;
    planCode: string;
    billingCycleCode: string;
    statusCode?: string;
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
      billingCycleCode: input.billingCycleCode,
    },
    execute: async () => {
      return db.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
          where: { code: input.productCode },
          include: { status: true },
        });
        if (!product || product.status.code !== MASTER.productStatus.ACTIVE) {
          throw new Error("Product not found");
        }

        const plan = await tx.plan.findUnique({
          where: {
            productId_code: { productId: product.id, code: input.planCode },
          },
          include: { status: true },
        });
        if (!plan || plan.status.code !== MASTER.planStatus.ACTIVE) {
          throw new Error("Plan not found");
        }

        const publishedStatusId = await requireActiveMasterId(
          tx,
          "planVersionStatus",
          MASTER.planVersionStatus.PUBLISHED,
        );

        const planVersion = await tx.planVersion.findFirst({
          where: { planId: plan.id, statusId: publishedStatusId },
          orderBy: { versionNumber: "desc" },
          include: {
            features: { include: { feature: true } },
          },
        });
        if (!planVersion) throw new Error("Published plan version not found");

        const activeStatusIds = await tx.subscriptionStatus.findMany({
          where: { code: { in: [...ACTIVE_SUBSCRIPTION_STATUS_CODES] } },
          select: { id: true },
        });

        const existing = await tx.subscription.findFirst({
          where: {
            organizationId: input.organizationId,
            productId: product.id,
            statusId: { in: activeStatusIds.map((s) => s.id) },
          },
        });
        if (existing) {
          throw new Error(
            "Active subscription already exists for this organization and product",
          );
        }

        const billingCycleId = await requireActiveMasterId(
          tx,
          "billingCycle",
          input.billingCycleCode,
        );
        const statusId = await requireActiveMasterId(
          tx,
          "subscriptionStatus",
          input.statusCode ?? MASTER.subscriptionStatus.ACTIVE,
        );
        const auditActionId = await requireActiveMasterId(
          tx,
          "auditActionType",
          MASTER.auditActionType.SUBSCRIPTION_CREATE,
        );
        const outboxPendingId = await requireActiveMasterId(
          tx,
          "outboxEventStatus",
          MASTER.outboxEventStatus.PENDING,
        );

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
          billingCycleCode: input.billingCycleCode,
          featureCodes,
          limits: { ...limitsFromPlan, ...(input.limits ?? {}) },
        });

        const subscription = await tx.subscription.create({
          data: {
            organizationId: input.organizationId,
            productId: product.id,
            planId: plan.id,
            planVersionId: planVersion.id,
            statusId,
            billingCycleId,
            planCode: plan.code,
            planVersionNumber: planVersion.versionNumber,
            priceAmount: planVersion.priceAmount,
            currency: planVersion.currency,
            snapshotJson: snapshot,
            startsAt: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId: input.organizationId,
            actorAuthUserId: input.actorAuthUserId,
            actionTypeId: auditActionId,
            entityType: "Subscription",
            entityId: subscription.id,
            afterJson: {
              productCode: product.code,
              planCode: plan.code,
              snapshot,
            },
          },
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: "Subscription",
            aggregateId: subscription.id,
            eventType: "subscription.changed",
            organizationId: input.organizationId,
            statusId: outboxPendingId,
            payloadJson: {
              organizationId: input.organizationId,
              productCode: product.code,
              subscriptionId: subscription.id,
            },
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
  nextSnapshot: unknown,
): Promise<void> {
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!sub) throw new Error("Subscription not found");
  const current = JSON.stringify(sub.snapshotJson);
  const next = JSON.stringify(nextSnapshot);
  if (current !== next) {
    throw new Error(
      "Plan feature snapshot cannot be changed after activation",
    );
  }
}
