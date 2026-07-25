import type { Prisma, PrismaClient } from "@prisma/client";

import { TH } from "@/lib/i18n/th";
import {
  ACTIVE_SUBSCRIPTION_STATUS_CODES,
  MASTER,
} from "@/lib/platform/master-codes";
import { requireActiveMasterId } from "@/lib/platform/master-data";
import type { ActorAccess } from "@/lib/platform/organizations-admin";
import { buildSubscriptionSnapshot } from "@/lib/platform/snapshot";
import { withIdempotency } from "@/lib/platform/idempotency";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";

type Db = PrismaClient | Prisma.TransactionClient;

export class SubscriptionLifecycleError extends Error {
  constructor(
    public readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "VALIDATION"
      | "INVALID_STATE",
    message: string,
  ) {
    super(message);
    this.name = "SubscriptionLifecycleError";
  }
}

function assertSubscriptionManage(
  actor: ActorAccess & { organizationRoles?: string[] },
) {
  if (actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) return;
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles ?? [],
  });
  if (!perms.includes(PLATFORM_PERMISSIONS.subscriptionManage)) {
    throw new SubscriptionLifecycleError("FORBIDDEN", TH.common.forbidden);
  }
}

function assertCanAccessOrg(
  actor: ActorAccess,
  organizationId: string,
) {
  if (actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) return;
  if (!actor.membershipOrganizationIds.includes(organizationId)) {
    throw new SubscriptionLifecycleError("FORBIDDEN", TH.common.forbidden);
  }
}

async function ensureAuditAction(
  db: Db,
  code: string,
  nameTh: string,
  nameEn: string,
  sortOrder: number,
) {
  return db.auditActionType.upsert({
    where: { code },
    create: {
      code,
      nameTh,
      nameEn,
      sortOrder,
      isActive: true,
      isSystem: true,
    },
    update: {},
  });
}

async function setEntitlementStatusForSubscription(
  db: Db,
  subscriptionId: string,
  entitlementStatusCode: string,
) {
  const status = await db.entitlementStatus.findUnique({
    where: { code: entitlementStatusCode },
  });
  if (!status) return;
  await db.entitlement.updateMany({
    where: { subscriptionId },
    data: { statusId: status.id },
  });
}

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
    endsAt?: Date | null;
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
      statusCode: input.statusCode ?? MASTER.subscriptionStatus.ACTIVE,
    },
    execute: async () => {
      return db.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
          where: { code: input.productCode },
          include: { status: true },
        });
        if (!product || product.status.code !== MASTER.productStatus.ACTIVE) {
          throw new SubscriptionLifecycleError(
            "NOT_FOUND",
            "ไม่พบผลิตภัณฑ์ที่ใช้งานได้",
          );
        }

        const plan = await tx.plan.findUnique({
          where: {
            productId_code: { productId: product.id, code: input.planCode },
          },
          include: { status: true },
        });
        if (!plan || plan.status.code !== MASTER.planStatus.ACTIVE) {
          throw new SubscriptionLifecycleError(
            "NOT_FOUND",
            "ไม่พบแพ็กเกจที่ใช้งานได้",
          );
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
        if (!planVersion) {
          throw new SubscriptionLifecycleError(
            "NOT_FOUND",
            "ไม่พบเวอร์ชันแพ็กเกจที่เผยแพร่",
          );
        }

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
          throw new SubscriptionLifecycleError(
            "CONFLICT",
            "องค์กรนี้มีการสมัครผลิตภัณฑ์นี้อยู่แล้ว",
          );
        }

        const billingCycleId = await requireActiveMasterId(
          tx,
          "billingCycle",
          input.billingCycleCode,
        );
        const statusCode =
          input.statusCode ?? MASTER.subscriptionStatus.ACTIVE;
        const statusId = await requireActiveMasterId(
          tx,
          "subscriptionStatus",
          statusCode,
        );
        const auditActionId = await requireActiveMasterId(
          tx,
          "auditActionType",
          statusCode === MASTER.subscriptionStatus.TRIAL
            ? MASTER.auditActionType.SUBSCRIPTION_TRIAL
            : MASTER.auditActionType.SUBSCRIPTION_CREATE,
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

        const trialEndsAt =
          statusCode === MASTER.subscriptionStatus.TRIAL
            ? new Date(
                Date.now() +
                  Math.max(planVersion.trialDays ?? 14, 1) *
                    24 *
                    60 *
                    60 *
                    1000,
              )
            : null;

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
            endsAt: input.endsAt ?? null,
            trialEndsAt,
          },
        });

        const { generateEntitlementsForSubscription } = await import(
          "@/lib/platform/entitlements"
        );
        await generateEntitlementsForSubscription(tx, subscription.id);

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
              statusCode,
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

export async function getSubscription(db: PrismaClient, id: string) {
  const subscription = await db.subscription.findUnique({
    where: { id },
    include: {
      status: true,
      billingCycle: true,
      product: {
        select: { id: true, code: true, name: true, nameTh: true },
      },
      plan: { select: { id: true, code: true, name: true } },
      planVersion: true,
      organization: {
        select: { id: true, displayName: true, customerCode: true },
      },
      entitlements: {
        include: { status: true },
        orderBy: { code: "asc" },
      },
    },
  });
  if (!subscription) {
    throw new SubscriptionLifecycleError("NOT_FOUND", TH.common.notFound);
  }
  return subscription;
}

export async function listSubscriptionsForActor(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  options: {
    organizationId?: string;
    statusCode?: string;
    skip?: number;
    take?: number;
  } = {},
) {
  const isSuper = actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles ?? [],
  });
  if (!isSuper && !perms.includes(PLATFORM_PERMISSIONS.subscriptionRead)) {
    throw new SubscriptionLifecycleError("FORBIDDEN", TH.common.forbidden);
  }

  const take = Math.min(Math.max(options.take ?? 50, 1), 100);
  const skip = Math.max(options.skip ?? 0, 0);
  const where: Prisma.SubscriptionWhereInput = {};

  if (options.organizationId) {
    assertCanAccessOrg(actor, options.organizationId);
    where.organizationId = options.organizationId;
  } else if (!isSuper) {
    where.organizationId = { in: actor.membershipOrganizationIds };
  }
  if (options.statusCode) {
    where.status = { code: options.statusCode };
  }

  const [total, rows] = await Promise.all([
    db.subscription.count({ where }),
    db.subscription.findMany({
      where,
      include: {
        status: { select: { code: true, nameTh: true } },
        billingCycle: { select: { code: true, nameTh: true } },
        product: { select: { id: true, code: true, name: true, nameTh: true } },
        plan: { select: { id: true, code: true, name: true } },
        organization: {
          select: { id: true, displayName: true, customerCode: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);
  return { total, rows, skip, take };
}

async function transitionStatus(
  db: PrismaClient,
  input: {
    actor: ActorAccess & { organizationRoles?: string[] };
    subscriptionId: string;
    toStatus: string;
    auditCode: string;
    auditNameTh: string;
    auditNameEn: string;
    auditSort: number;
    allowedFrom: string[];
    onAfter?: (tx: Prisma.TransactionClient, subId: string) => Promise<void>;
    extraUpdate?: Prisma.SubscriptionUpdateInput;
  },
) {
  assertSubscriptionManage(input.actor);
  return db.$transaction(async (tx) => {
    const sub = await tx.subscription.findUnique({
      where: { id: input.subscriptionId },
      include: { status: true },
    });
    if (!sub) {
      throw new SubscriptionLifecycleError("NOT_FOUND", TH.common.notFound);
    }
    assertCanAccessOrg(input.actor, sub.organizationId);
    if (!input.allowedFrom.includes(sub.status.code)) {
      throw new SubscriptionLifecycleError(
        "INVALID_STATE",
        `ไม่สามารถเปลี่ยนสถานะจาก ${sub.status.code} ได้`,
      );
    }
    const statusId = await requireActiveMasterId(
      tx,
      "subscriptionStatus",
      input.toStatus,
    );
    const updated = await tx.subscription.update({
      where: { id: sub.id },
      data: {
        statusId,
        ...(input.extraUpdate ?? {}),
      } as Prisma.SubscriptionUpdateInput,
    });
    if (input.onAfter) {
      await input.onAfter(tx, sub.id);
    }
    const audit = await ensureAuditAction(
      tx,
      input.auditCode,
      input.auditNameTh,
      input.auditNameEn,
      input.auditSort,
    );
    await tx.auditLog.create({
      data: {
        organizationId: sub.organizationId,
        actorAuthUserId: input.actor.authUserId,
        actionTypeId: audit.id,
        entityType: "Subscription",
        entityId: sub.id,
        beforeJson: { status: sub.status.code },
        afterJson: { status: input.toStatus },
      },
    });
    return updated;
  });
}

export async function activateSubscription(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  subscriptionId: string,
) {
  return transitionStatus(db, {
    actor,
    subscriptionId,
    toStatus: MASTER.subscriptionStatus.ACTIVE,
    auditCode: MASTER.auditActionType.SUBSCRIPTION_ACTIVATE,
    auditNameTh: "เปิดใช้งานการสมัคร",
    auditNameEn: "Activate subscription",
    auditSort: 89,
    allowedFrom: [
      MASTER.subscriptionStatus.TRIAL,
      MASTER.subscriptionStatus.SUSPENDED,
      MASTER.subscriptionStatus.PAST_DUE,
    ],
    onAfter: async (tx, subId) => {
      const { generateEntitlementsForSubscription } = await import(
        "@/lib/platform/entitlements"
      );
      await generateEntitlementsForSubscription(tx, subId);
    },
  });
}

export async function suspendSubscription(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  subscriptionId: string,
) {
  return transitionStatus(db, {
    actor,
    subscriptionId,
    toStatus: MASTER.subscriptionStatus.SUSPENDED,
    auditCode: MASTER.auditActionType.SUBSCRIPTION_SUSPEND,
    auditNameTh: "ระงับการสมัคร",
    auditNameEn: "Suspend subscription",
    auditSort: 91,
    allowedFrom: [
      MASTER.subscriptionStatus.ACTIVE,
      MASTER.subscriptionStatus.TRIAL,
      MASTER.subscriptionStatus.PAST_DUE,
    ],
    onAfter: async (tx, subId) => {
      await setEntitlementStatusForSubscription(
        tx,
        subId,
        MASTER.entitlementStatus.SUSPENDED,
      );
    },
  });
}

export async function resumeSubscription(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  subscriptionId: string,
) {
  return transitionStatus(db, {
    actor,
    subscriptionId,
    toStatus: MASTER.subscriptionStatus.ACTIVE,
    auditCode: "subscription.resume",
    auditNameTh: "กลับมาใช้งานการสมัคร",
    auditNameEn: "Resume subscription",
    auditSort: 97,
    allowedFrom: [MASTER.subscriptionStatus.SUSPENDED],
    onAfter: async (tx, subId) => {
      const { generateEntitlementsForSubscription } = await import(
        "@/lib/platform/entitlements"
      );
      await generateEntitlementsForSubscription(tx, subId);
    },
  });
}

export async function cancelSubscription(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  subscriptionId: string,
) {
  return transitionStatus(db, {
    actor,
    subscriptionId,
    toStatus: MASTER.subscriptionStatus.CANCELLED,
    auditCode: MASTER.auditActionType.SUBSCRIPTION_CANCEL,
    auditNameTh: "ยกเลิกการสมัคร",
    auditNameEn: "Cancel subscription",
    auditSort: 92,
    allowedFrom: [
      MASTER.subscriptionStatus.ACTIVE,
      MASTER.subscriptionStatus.TRIAL,
      MASTER.subscriptionStatus.SUSPENDED,
      MASTER.subscriptionStatus.PAST_DUE,
    ],
    extraUpdate: { cancelledAt: new Date() },
    onAfter: async (tx, subId) => {
      await setEntitlementStatusForSubscription(
        tx,
        subId,
        MASTER.entitlementStatus.REVOKED,
      );
    },
  });
}

export async function expireSubscription(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  subscriptionId: string,
) {
  return transitionStatus(db, {
    actor,
    subscriptionId,
    toStatus: MASTER.subscriptionStatus.EXPIRED,
    auditCode: "subscription.expire",
    auditNameTh: "หมดอายุการสมัคร",
    auditNameEn: "Expire subscription",
    auditSort: 98,
    allowedFrom: [
      MASTER.subscriptionStatus.ACTIVE,
      MASTER.subscriptionStatus.TRIAL,
      MASTER.subscriptionStatus.PAST_DUE,
      MASTER.subscriptionStatus.SUSPENDED,
    ],
    extraUpdate: { endsAt: new Date() },
    onAfter: async (tx, subId) => {
      await setEntitlementStatusForSubscription(
        tx,
        subId,
        MASTER.entitlementStatus.EXPIRED,
      );
    },
  });
}

export async function extendSubscriptionEndDate(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  input: { subscriptionId: string; endsAt: Date },
) {
  assertSubscriptionManage(actor);
  if (Number.isNaN(input.endsAt.getTime())) {
    throw new SubscriptionLifecycleError("VALIDATION", "วันสิ้นสุดไม่ถูกต้อง");
  }
  const sub = await db.subscription.findUnique({
    where: { id: input.subscriptionId },
    include: { status: true },
  });
  if (!sub) {
    throw new SubscriptionLifecycleError("NOT_FOUND", TH.common.notFound);
  }
  assertCanAccessOrg(actor, sub.organizationId);
  if (
    [
      MASTER.subscriptionStatus.CANCELLED,
      MASTER.subscriptionStatus.EXPIRED,
    ].includes(sub.status.code as "CANCELLED" | "EXPIRED")
  ) {
    throw new SubscriptionLifecycleError(
      "INVALID_STATE",
      "ไม่สามารถขยายวันสิ้นสุดของการสมัครที่ยกเลิกหรือหมดอายุแล้ว",
    );
  }
  if (input.endsAt <= new Date()) {
    throw new SubscriptionLifecycleError(
      "VALIDATION",
      "วันสิ้นสุดต้องเป็นอนาคต",
    );
  }
  const updated = await db.subscription.update({
    where: { id: sub.id },
    data: { endsAt: input.endsAt },
  });
  await db.entitlement.updateMany({
    where: { subscriptionId: sub.id },
    data: { endsAt: input.endsAt },
  });
  const audit = await ensureAuditAction(
    db,
    "subscription.extend",
    "ขยายวันสิ้นสุดการสมัคร",
    "Extend subscription",
    99,
  );
  await db.auditLog.create({
    data: {
      organizationId: sub.organizationId,
      actorAuthUserId: actor.authUserId,
      actionTypeId: audit.id,
      entityType: "Subscription",
      entityId: sub.id,
      beforeJson: { endsAt: sub.endsAt },
      afterJson: { endsAt: input.endsAt },
    },
  });
  return updated;
}

export async function changePlan(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  input: {
    subscriptionId: string;
    planCode: string;
    billingCycleCode?: string;
    idempotencyKey: string;
  },
) {
  assertSubscriptionManage(actor);
  return withIdempotency(db, {
    scope: "subscription.change_plan",
    key: input.idempotencyKey,
    request: {
      subscriptionId: input.subscriptionId,
      planCode: input.planCode,
      billingCycleCode: input.billingCycleCode,
    },
    execute: async () => {
      return db.$transaction(async (tx) => {
        const sub = await tx.subscription.findUnique({
          where: { id: input.subscriptionId },
          include: { status: true, product: true, plan: true },
        });
        if (!sub) {
          throw new SubscriptionLifecycleError("NOT_FOUND", TH.common.notFound);
        }
        assertCanAccessOrg(actor, sub.organizationId);
        if (
          ![
            MASTER.subscriptionStatus.ACTIVE,
            MASTER.subscriptionStatus.TRIAL,
            MASTER.subscriptionStatus.PAST_DUE,
          ].includes(sub.status.code as "ACTIVE" | "TRIAL" | "PAST_DUE")
        ) {
          throw new SubscriptionLifecycleError(
            "INVALID_STATE",
            "เปลี่ยนแพ็กเกจได้เฉพาะการสมัครที่ใช้งานหรือทดลองใช้",
          );
        }

        const plan = await tx.plan.findUnique({
          where: {
            productId_code: {
              productId: sub.productId,
              code: input.planCode,
            },
          },
          include: { status: true },
        });
        if (!plan || plan.status.code !== MASTER.planStatus.ACTIVE) {
          throw new SubscriptionLifecycleError(
            "NOT_FOUND",
            "ไม่พบแพ็กเกจปลายทาง",
          );
        }

        const publishedStatusId = await requireActiveMasterId(
          tx,
          "planVersionStatus",
          MASTER.planVersionStatus.PUBLISHED,
        );
        const planVersion = await tx.planVersion.findFirst({
          where: { planId: plan.id, statusId: publishedStatusId },
          orderBy: { versionNumber: "desc" },
          include: { features: { include: { feature: true } } },
        });
        if (!planVersion) {
          throw new SubscriptionLifecycleError(
            "NOT_FOUND",
            "ไม่พบเวอร์ชันแพ็กเกจที่เผยแพร่",
          );
        }

        const billingCycleCode =
          input.billingCycleCode ??
          (
            await tx.billingCycle.findUnique({
              where: { id: sub.billingCycleId },
            })
          )?.code;
        if (!billingCycleCode) {
          throw new SubscriptionLifecycleError(
            "VALIDATION",
            "ไม่พบรอบบิล",
          );
        }
        const billingCycleId = await requireActiveMasterId(
          tx,
          "billingCycle",
          billingCycleCode,
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
          product: sub.product,
          plan,
          planVersion,
          billingCycleCode,
          featureCodes,
          limits: limitsFromPlan,
        });

        const previousSnapshot = sub.snapshotJson;
        const updated = await tx.subscription.update({
          where: { id: sub.id },
          data: {
            planId: plan.id,
            planVersionId: planVersion.id,
            billingCycleId,
            planCode: plan.code,
            planVersionNumber: planVersion.versionNumber,
            priceAmount: planVersion.priceAmount,
            currency: planVersion.currency,
            snapshotJson: snapshot,
          },
        });

        const { generateEntitlementsForSubscription } = await import(
          "@/lib/platform/entitlements"
        );
        await generateEntitlementsForSubscription(tx, sub.id);

        const audit = await ensureAuditAction(
          tx,
          MASTER.auditActionType.SUBSCRIPTION_CHANGE_PLAN,
          "เปลี่ยนแพ็กเกจ",
          "Change subscription plan",
          93,
        );
        await tx.auditLog.create({
          data: {
            organizationId: sub.organizationId,
            actorAuthUserId: actor.authUserId,
            actionTypeId: audit.id,
            entityType: "Subscription",
            entityId: sub.id,
            beforeJson: {
              planCode: sub.planCode,
              snapshot: previousSnapshot,
            },
            afterJson: {
              planCode: plan.code,
              snapshot,
            },
          },
        });

        return { subscriptionId: updated.id, snapshot };
      });
    },
  });
}

export async function listSubscriptionHistoryFromAudit(
  db: PrismaClient,
  subscriptionId: string,
) {
  return db.auditLog.findMany({
    where: {
      entityId: subscriptionId,
      entityType: { in: ["Subscription", "subscription"] },
    },
    include: {
      actionType: { select: { code: true, nameTh: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
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
  if (!sub) {
    throw new SubscriptionLifecycleError("NOT_FOUND", "ไม่พบการสมัคร");
  }
  const current = JSON.stringify(sub.snapshotJson);
  const next = JSON.stringify(nextSnapshot);
  if (current !== next) {
    throw new SubscriptionLifecycleError(
      "VALIDATION",
      "ห้ามแก้ snapshot ของการสมัครเดิม — ต้องเปลี่ยนแพ็กเกจเพื่อสร้าง snapshot ใหม่",
    );
  }
}
