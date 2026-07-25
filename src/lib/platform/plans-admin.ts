import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import { requireActiveMasterId } from "@/lib/platform/master-data";
import type { ActorAccess } from "@/lib/platform/organizations-admin";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";

type Db = PrismaClient | Prisma.TransactionClient;

export class PlanAdminError extends Error {
  constructor(
    public readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CODE_DUPLICATE"
      | "CODE_IMMUTABLE"
      | "VALIDATION"
      | "IN_USE",
    message: string,
  ) {
    super(message);
    this.name = "PlanAdminError";
  }
}

const featureInputSchema = z.object({
  featureCode: z.string().trim().min(1).max(128),
  limitValue: z.string().trim().max(64).optional().nullable(),
});

export const createPlanSchema = z.object({
  productId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/, "รหัสแพ็กเกจไม่ถูกต้อง"),
  name: z.string().trim().min(1).max(200),
  nameTh: z.string().trim().min(1).max(200).optional(),
  nameEn: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  billingCycleCode: z.string().trim().min(1),
  basePrice: z.number().min(0, "ราคาห้ามติดลบ"),
  currency: z.string().trim().min(3).max(8).default("THB"),
  trialDays: z.number().int().min(0, "วันทดลองห้ามติดลบ").default(0),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  features: z.array(featureInputSchema).default([]),
});

export const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const duplicatePlanVersionSchema = z.object({
  basePrice: z.number().min(0).optional(),
  currency: z.string().trim().min(3).max(8).optional(),
  trialDays: z.number().int().min(0).optional(),
  billingCycleCode: z.string().trim().min(1).optional(),
  features: z.array(featureInputSchema).optional(),
  publish: z.boolean().default(true),
});

function assertPlanManage(
  actor: ActorAccess & { organizationRoles?: string[] },
) {
  if (actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) return;
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles ?? [],
  });
  if (!perms.includes(PLATFORM_PERMISSIONS.planManage)) {
    throw new PlanAdminError("FORBIDDEN", TH.common.forbidden);
  }
}

function assertPlanRead(actor: ActorAccess & { organizationRoles?: string[] }) {
  if (actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) return;
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles ?? [],
  });
  if (!perms.includes(PLATFORM_PERMISSIONS.planRead)) {
    throw new PlanAdminError("FORBIDDEN", TH.common.forbidden);
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

export async function listPlans(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  options: {
    productId?: string;
    statusCode?: string;
    skip?: number;
    take?: number;
  } = {},
) {
  assertPlanRead(actor);
  const take = Math.min(Math.max(options.take ?? 50, 1), 100);
  const skip = Math.max(options.skip ?? 0, 0);
  const where: Prisma.PlanWhereInput = {};
  if (options.productId) where.productId = options.productId;
  if (options.statusCode) where.status = { code: options.statusCode };
  const [total, rows] = await Promise.all([
    db.plan.count({ where }),
    db.plan.findMany({
      where,
      include: {
        status: { select: { code: true, nameTh: true } },
        product: { select: { id: true, code: true, name: true, nameTh: true } },
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: {
            status: { select: { code: true } },
            billingCycleDefault: { select: { code: true, nameTh: true } },
          },
        },
        _count: { select: { subscriptions: true, versions: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      skip,
      take,
    }),
  ]);
  return { total, rows, skip, take };
}

export async function getPlan(db: PrismaClient, id: string) {
  const plan = await db.plan.findUnique({
    where: { id },
    include: {
      status: true,
      product: { select: { id: true, code: true, name: true, nameTh: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          status: true,
          billingCycleDefault: true,
          features: { include: { feature: true } },
        },
      },
      _count: { select: { subscriptions: true } },
    },
  });
  if (!plan) throw new PlanAdminError("NOT_FOUND", TH.common.notFound);
  return plan;
}

export async function createPlan(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  raw: unknown,
) {
  assertPlanManage(actor);
  const input = createPlanSchema.parse(raw);
  const product = await db.product.findUnique({
    where: { id: input.productId },
    include: { status: true },
  });
  if (!product || product.status.code !== MASTER.productStatus.ACTIVE) {
    throw new PlanAdminError("NOT_FOUND", "ไม่พบผลิตภัณฑ์ที่ใช้งานได้");
  }
  const duplicate = await db.plan.findUnique({
    where: {
      productId_code: { productId: input.productId, code: input.code },
    },
  });
  if (duplicate) {
    throw new PlanAdminError("CODE_DUPLICATE", "รหัสแพ็กเกจนี้มีในผลิตภัณฑ์แล้ว");
  }

  return db.$transaction(async (tx) => {
    const planStatusId = await requireActiveMasterId(
      tx,
      "planStatus",
      MASTER.planStatus.ACTIVE,
    );
    const publishedStatusId = await requireActiveMasterId(
      tx,
      "planVersionStatus",
      MASTER.planVersionStatus.PUBLISHED,
    );
    const billingCycleId = await requireActiveMasterId(
      tx,
      "billingCycle",
      input.billingCycleCode,
    );
    const plan = await tx.plan.create({
      data: {
        productId: input.productId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        sortOrder: input.sortOrder,
        statusId: planStatusId,
      },
    });

    const version = await tx.planVersion.create({
      data: {
        planId: plan.id,
        versionNumber: 1,
        statusId: publishedStatusId,
        billingCycleDefaultId: billingCycleId,
        priceAmount: input.basePrice,
        currency: input.currency,
        trialDays: input.trialDays,
        publishedAt: new Date(),
      },
    });

    for (const feature of input.features) {
      const featureRow = await tx.feature.findUnique({
        where: { code: feature.featureCode },
      });
      if (!featureRow || featureRow.productId !== input.productId) {
        throw new PlanAdminError(
          "VALIDATION",
          `ไม่พบคุณสมบัติ ${feature.featureCode} ในผลิตภัณฑ์นี้`,
        );
      }
      await tx.planVersionFeature.create({
        data: {
          planVersionId: version.id,
          featureId: featureRow.id,
          limitValue: feature.limitValue ?? null,
        },
      });
    }

    const audit = await ensureAuditAction(
      tx,
      MASTER.auditActionType.PLAN_CREATE,
      "สร้างแพ็กเกจ",
      "Create plan",
      87,
    );
    await tx.auditLog.create({
      data: {
        actorAuthUserId: actor.authUserId,
        actionTypeId: audit.id,
        entityType: "Plan",
        entityId: plan.id,
        afterJson: {
          productCode: product.code,
          planCode: plan.code,
          versionNumber: 1,
          basePrice: input.basePrice,
          currency: input.currency,
        },
      },
    });
    return { plan, version };
  });
}

export async function updatePlan(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  id: string,
  raw: unknown,
) {
  assertPlanManage(actor);
  const input = updatePlanSchema.parse(raw);
  if ("code" in (raw as Record<string, unknown>)) {
    throw new PlanAdminError(
      "CODE_IMMUTABLE",
      "ไม่สามารถเปลี่ยนรหัสแพ็กเกจหลังสร้างแล้ว",
    );
  }
  const existing = await db.plan.findUnique({ where: { id } });
  if (!existing) throw new PlanAdminError("NOT_FOUND", TH.common.notFound);

  const subscriptionCount = await db.subscription.count({
    where: { planId: id },
  });
  if (
    subscriptionCount > 0 &&
    ("basePrice" in (raw as object) || "features" in (raw as object))
  ) {
    throw new PlanAdminError(
      "IN_USE",
      "แพ็กเกจถูกใช้งานแล้ว กรุณาสร้างเวอร์ชันใหม่แทนการแก้ snapshot",
    );
  }

  const audit = await ensureAuditAction(
    db,
    MASTER.auditActionType.PLAN_UPDATE,
    "แก้ไขแพ็กเกจ",
    "Update plan",
    88,
  );
  const plan = await db.plan.update({
    where: { id },
    data: {
      name: input.name ?? existing.name,
      description:
        input.description === undefined
          ? existing.description
          : input.description,
      sortOrder: input.sortOrder ?? existing.sortOrder,
    },
  });
  await db.auditLog.create({
    data: {
      actorAuthUserId: actor.authUserId,
      actionTypeId: audit.id,
      entityType: "Plan",
      entityId: plan.id,
      beforeJson: {
        name: existing.name,
        description: existing.description,
        sortOrder: existing.sortOrder,
      },
      afterJson: {
        name: plan.name,
        description: plan.description,
        sortOrder: plan.sortOrder,
      },
    },
  });
  return plan;
}

export async function setPlanStatus(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  id: string,
  statusCode: string,
) {
  assertPlanManage(actor);
  if (
    statusCode !== MASTER.planStatus.ACTIVE &&
    statusCode !== MASTER.planStatus.RETIRED
  ) {
    throw new PlanAdminError("VALIDATION", "สถานะแพ็กเกจไม่ถูกต้อง");
  }
  const existing = await db.plan.findUnique({
    where: { id },
    include: { status: true },
  });
  if (!existing) throw new PlanAdminError("NOT_FOUND", TH.common.notFound);
  const statusId = await requireActiveMasterId(db, "planStatus", statusCode);
  const audit = await ensureAuditAction(
    db,
    statusCode === MASTER.planStatus.ACTIVE
      ? "plan.activate"
      : "plan.deactivate",
    statusCode === MASTER.planStatus.ACTIVE
      ? "เปิดใช้งานแพ็กเกจ"
      : "ปิดใช้งานแพ็กเกจ",
    statusCode === MASTER.planStatus.ACTIVE ? "Activate plan" : "Deactivate plan",
    statusCode === MASTER.planStatus.ACTIVE ? 102 : 103,
  );
  const plan = await db.plan.update({ where: { id }, data: { statusId } });
  await db.auditLog.create({
    data: {
      actorAuthUserId: actor.authUserId,
      actionTypeId: audit.id,
      entityType: "Plan",
      entityId: plan.id,
      beforeJson: { status: existing.status.code },
      afterJson: { status: statusCode },
    },
  });
  return plan;
}

export async function duplicatePlanVersion(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  planId: string,
  raw: unknown = {},
) {
  assertPlanManage(actor);
  const input = duplicatePlanVersionSchema.parse(raw);
  const plan = await getPlan(db, planId);
  const latest = plan.versions[0];
  if (!latest) {
    throw new PlanAdminError("NOT_FOUND", "ไม่พบเวอร์ชันแพ็กเกจ");
  }

  return db.$transaction(async (tx) => {
    const statusId = await requireActiveMasterId(
      tx,
      "planVersionStatus",
      input.publish
        ? MASTER.planVersionStatus.PUBLISHED
        : MASTER.planVersionStatus.DRAFT,
    );
    const billingCycleId = input.billingCycleCode
      ? await requireActiveMasterId(tx, "billingCycle", input.billingCycleCode)
      : latest.billingCycleDefaultId;

    if (input.publish) {
      const retiredId = await requireActiveMasterId(
        tx,
        "planVersionStatus",
        MASTER.planVersionStatus.RETIRED,
      );
      await tx.planVersion.updateMany({
        where: {
          planId,
          statusId: await requireActiveMasterId(
            tx,
            "planVersionStatus",
            MASTER.planVersionStatus.PUBLISHED,
          ),
        },
        data: { statusId: retiredId },
      });
    }

    const version = await tx.planVersion.create({
      data: {
        planId,
        versionNumber: latest.versionNumber + 1,
        statusId,
        billingCycleDefaultId: billingCycleId,
        priceAmount: input.basePrice ?? latest.priceAmount,
        currency: input.currency ?? latest.currency,
        trialDays: input.trialDays ?? latest.trialDays,
        publishedAt: input.publish ? new Date() : null,
      },
    });

    const features = input.features
      ? input.features
      : latest.features.map((f) => ({
          featureCode: f.feature.code,
          limitValue: f.limitValue,
        }));

    for (const feature of features) {
      const featureRow = await tx.feature.findUnique({
        where: { code: feature.featureCode },
      });
      if (!featureRow || featureRow.productId !== plan.productId) {
        throw new PlanAdminError(
          "VALIDATION",
          `ไม่พบคุณสมบัติ ${feature.featureCode}`,
        );
      }
      await tx.planVersionFeature.create({
        data: {
          planVersionId: version.id,
          featureId: featureRow.id,
          limitValue: feature.limitValue ?? null,
        },
      });
    }

    const audit = await ensureAuditAction(
      tx,
      MASTER.auditActionType.PLAN_UPDATE,
      "แก้ไขแพ็กเกจ",
      "Update plan",
      88,
    );
    await tx.auditLog.create({
      data: {
        actorAuthUserId: actor.authUserId,
        actionTypeId: audit.id,
        entityType: "Plan",
        entityId: planId,
        afterJson: {
          action: "duplicate_version",
          versionNumber: version.versionNumber,
          published: input.publish,
        },
      },
    });
    return version;
  });
}
