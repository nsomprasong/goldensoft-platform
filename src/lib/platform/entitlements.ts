import type { Prisma, PrismaClient } from "@prisma/client";

import { ensureAuditActionType } from "@/lib/platform/audit";
import { MASTER } from "@/lib/platform/master-codes";

type SnapshotFeature = {
  code: string;
  name?: string;
  limitValue?: string | null;
};

function featuresFromSnapshot(snapshotJson: unknown): SnapshotFeature[] {
  if (!snapshotJson || typeof snapshotJson !== "object") return [];
  const features = (snapshotJson as { features?: unknown }).features;
  if (!Array.isArray(features)) {
    const featureCodes = (snapshotJson as { featureCodes?: unknown })
      .featureCodes;
    const limits = (snapshotJson as { limits?: Record<string, unknown> }).limits;
    if (Array.isArray(featureCodes)) {
      return featureCodes
        .filter((c): c is string => typeof c === "string")
        .map((code) => ({
          code,
          name: code,
          limitValue:
            limits && limits[code] != null ? String(limits[code]) : null,
        }));
    }
    return [];
  }
  const result: SnapshotFeature[] = [];
  for (const item of features) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.code !== "string") continue;
    result.push({
      code: row.code,
      name: typeof row.name === "string" ? row.name : row.code,
      limitValue:
        typeof row.limitValue === "string" || row.limitValue === null
          ? (row.limitValue as string | null)
          : null,
    });
  }
  return result;
}

/**
 * Plan snapshots may list only some feature/permission codes. Always merge in
 * the product’s default catalog so gate entitlements like `hr.access` exist —
 * otherwise Customer App menus stay hidden even when the org bought the product.
 */
export function mergeSubscriptionFeatureCatalog(
  productCode: string,
  fromSnapshot: SnapshotFeature[],
): SnapshotFeature[] {
  const defaults = defaultEntitlementsForProduct(productCode);
  if (fromSnapshot.length === 0) return defaults;

  const byCode = new Map<string, SnapshotFeature>();
  for (const feature of defaults) {
    byCode.set(feature.code, feature);
  }
  for (const feature of fromSnapshot) {
    const previous = byCode.get(feature.code);
    byCode.set(feature.code, {
      code: feature.code,
      name: feature.name ?? previous?.name ?? feature.code,
      limitValue:
        feature.limitValue !== undefined && feature.limitValue !== null
          ? feature.limitValue
          : (previous?.limitValue ?? null),
    });
  }
  return [...byCode.values()];
}

function defaultEntitlementsForProduct(productCode: string): SnapshotFeature[] {
  return catalogFeaturesForProduct(productCode).map((f) => ({
    code: f.code,
    name: f.nameTh,
    limitValue: f.defaultLimitValue,
  }));
}

export type FeatureCatalogEntry = {
  code: string;
  nameTh: string;
  valueKind: "boolean" | "numeric" | "text";
  defaultLimitValue: string | null;
};

/**
 * Canonical customer/product codes vs shorter catalog codes stored on some
 * Product rows (e.g. onboarded plans). Entitlement checks must accept both.
 */
export function productCodeAliases(productCode: string): string[] {
  const code = productCode.trim().toUpperCase();
  if (code === "GOLDENSOFT_HR" || code === "HR") {
    return ["GOLDENSOFT_HR", "HR"];
  }
  if (code === "RESIDENT_V2" || code === "RESIDENT") {
    return ["RESIDENT_V2", "RESIDENT"];
  }
  if (code === "QRSTATION" || code === "QR_STATION") {
    return ["QRSTATION", "QR_STATION"];
  }
  return code.length > 0 ? [code] : [productCode];
}

/** Prefer the customer-facing product code used by apps and menus. */
export function canonicalProductCode(productCode: string): string {
  const aliases = productCodeAliases(productCode);
  if (aliases.includes("GOLDENSOFT_HR")) return "GOLDENSOFT_HR";
  if (aliases.includes("RESIDENT_V2")) return "RESIDENT_V2";
  if (aliases.includes("QRSTATION")) return "QRSTATION";
  return aliases[0] ?? productCode;
}

export function productCodesCompatible(left: string, right: string): boolean {
  return productCodeAliases(left).includes(right.trim().toUpperCase());
}

export function catalogFeaturesForProduct(
  productCode: string,
): FeatureCatalogEntry[] {
  const code = productCode.toUpperCase();
  if (code === "RESIDENT_V2" || code === "RESIDENT") {
    return [
      {
        code: "resident_v2.access",
        nameTh: "เข้าถึง Resident V2",
        valueKind: "boolean",
        defaultLimitValue: "true",
      },
      {
        code: "resident_v2.branch_limit",
        nameTh: "จำนวนสาขา",
        valueKind: "numeric",
        defaultLimitValue: "3",
      },
      {
        code: "resident_v2.user_limit",
        nameTh: "จำนวนผู้ใช้",
        valueKind: "numeric",
        defaultLimitValue: "20",
      },
    ];
  }
  if (code === "GOLDENSOFT_HR" || code === "HR") {
    return [
      {
        code: "hr.access",
        nameTh: "เข้าถึง GoldenSoft HR",
        valueKind: "boolean",
        defaultLimitValue: "true",
      },
      {
        code: "hr.employee_limit",
        nameTh: "จำนวนพนักงาน",
        valueKind: "numeric",
        defaultLimitValue: "50",
      },
      {
        code: "hr.branch_limit",
        nameTh: "จำนวนสาขา HR",
        valueKind: "numeric",
        defaultLimitValue: "3",
      },
      {
        code: "hr.mobile_clock_in",
        nameTh: "ลงเวลาผ่านมือถือ",
        valueKind: "boolean",
        defaultLimitValue: "false",
      },
      {
        code: "hr.payroll",
        nameTh: "เงินเดือน",
        valueKind: "boolean",
        defaultLimitValue: "false",
      },
      {
        code: "hr.overtime",
        nameTh: "ล่วงเวลา",
        valueKind: "boolean",
        defaultLimitValue: "false",
      },
    ];
  }
  if (code === "QRSTATION") {
    return [
      {
        code: "qrstation.access",
        nameTh: "เข้าถึง QR Station",
        valueKind: "boolean",
        defaultLimitValue: "true",
      },
      {
        code: "qrstation.device_limit",
        nameTh: "จำนวนอุปกรณ์",
        valueKind: "numeric",
        defaultLimitValue: "5",
      },
    ];
  }
  if (code === "PLATFORM") {
    return [
      {
        code: "platform.access",
        nameTh: "เข้าถึงศูนย์บริหาร",
        valueKind: "boolean",
        defaultLimitValue: "true",
      },
    ];
  }
  return [
    {
      code: `${code.toLowerCase()}.access`,
      nameTh: `เข้าถึง ${code}`,
      valueKind: "boolean",
      defaultLimitValue: "true",
    },
  ];
}

export async function ensureProductFeatureCatalog(
  db: Prisma.TransactionClient | PrismaClient,
  productId: string,
  productCode: string,
) {
  const activeStatus = await db.featureStatus.findUnique({
    where: { code: MASTER.featureStatus.ACTIVE },
    select: { id: true },
  });
  if (!activeStatus) {
    throw new Error("FEATURE_STATUS_MISSING");
  }
  const catalog = catalogFeaturesForProduct(productCode);
  const ensured = [];
  for (const item of catalog) {
    const row = await db.feature.upsert({
      where: { code: item.code },
      create: {
        productId,
        code: item.code,
        name: item.nameTh,
        statusId: activeStatus.id,
      },
      update: {
        name: item.nameTh,
        statusId: activeStatus.id,
        productId,
      },
    });
    ensured.push({
      id: row.id,
      code: row.code,
      name: row.name,
      valueKind: item.valueKind,
      defaultLimitValue: item.defaultLimitValue,
    });
  }
  return ensured;
}

export async function generateEntitlementsForSubscription(
  db: Prisma.TransactionClient | PrismaClient,
  subscriptionId: string,
) {
  const subscription = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      organizationId: true,
      productId: true,
      startsAt: true,
      endsAt: true,
      snapshotJson: true,
      product: { select: { code: true, name: true } },
    },
  });
  if (!subscription) {
    throw new Error("SUBSCRIPTION_NOT_FOUND");
  }

  const activeStatus = await db.entitlementStatus.findUnique({
    where: { code: MASTER.entitlementStatus.ACTIVE },
    select: { id: true },
  });
  if (!activeStatus) {
    throw new Error("ENTITLEMENT_STATUS_MISSING");
  }

  const fromSnapshot = featuresFromSnapshot(subscription.snapshotJson);
  const features = mergeSubscriptionFeatureCatalog(
    subscription.product.code,
    fromSnapshot,
  );

  const existingCount = await db.entitlement.count({
    where: {
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
    },
  });

  if (existingCount === 0) {
    // Fast path for onboarding / new subscriptions (avoids N upserts in a tx).
    await db.entitlement.createMany({
      data: features.map((feature) => ({
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        productId: subscription.productId,
        code: feature.code,
        nameTh: feature.name ?? feature.code,
        nameEn: feature.name ?? feature.code,
        limitValue: feature.limitValue ?? null,
        statusId: activeStatus.id,
        startsAt: subscription.startsAt,
        endsAt: subscription.endsAt,
        sourceSnapshotJson: subscription.snapshotJson as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
  } else {
    for (const feature of features) {
      await db.entitlement.upsert({
        where: {
          organizationId_subscriptionId_code: {
            organizationId: subscription.organizationId,
            subscriptionId: subscription.id,
            code: feature.code,
          },
        },
        create: {
          organizationId: subscription.organizationId,
          subscriptionId: subscription.id,
          productId: subscription.productId,
          code: feature.code,
          nameTh: feature.name ?? feature.code,
          nameEn: feature.name ?? feature.code,
          limitValue: feature.limitValue ?? null,
          statusId: activeStatus.id,
          startsAt: subscription.startsAt,
          endsAt: subscription.endsAt,
          sourceSnapshotJson: subscription.snapshotJson as Prisma.InputJsonValue,
        },
        update: {
          statusId: activeStatus.id,
          limitValue: feature.limitValue ?? null,
          endsAt: subscription.endsAt,
          sourceSnapshotJson: subscription.snapshotJson as Prisma.InputJsonValue,
        },
      });
    }
  }

  const created = await db.entitlement.findMany({
    where: {
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
    },
    orderBy: { code: "asc" },
  });

  // Uses module cache when pre-warmed outside the transaction.
  const actionTypeId = await ensureAuditActionType(
    db,
    MASTER.auditActionType.ENTITLEMENT_GENERATE,
  );
  await db.auditLog.create({
    data: {
      organizationId: subscription.organizationId,
      actionTypeId,
      entityType: "subscription",
      entityId: subscription.id,
      afterJson: {
        entitlementCodes: created.map((row) => row.code),
      },
    },
  });

  return created;
}

export async function listEntitlementsForOrganization(
  db: PrismaClient,
  organizationId: string,
) {
  return db.entitlement.findMany({
    where: { organizationId },
    orderBy: [{ code: "asc" }],
    select: {
      id: true,
      code: true,
      nameTh: true,
      nameEn: true,
      limitValue: true,
      startsAt: true,
      endsAt: true,
      createdAt: true,
      updatedAt: true,
      status: { select: { code: true, nameTh: true } },
      product: { select: { code: true, name: true, nameTh: true } },
      subscription: {
        select: {
          id: true,
          planCode: true,
          startsAt: true,
          endsAt: true,
          status: { select: { code: true, nameTh: true } },
        },
      },
    },
  });
}

export type EntitlementCheckResult = {
  allowed: boolean;
  value: string | null;
  reason: string;
  subscriptionStatus: string | null;
  expiresAt: string | null;
};

export async function assertOrganizationEntitlement(input: {
  db: PrismaClient;
  organizationId: string;
  productCode: string;
  entitlementCode: string;
  branchId?: string | null;
}): Promise<EntitlementCheckResult> {
  const now = new Date();
  const row = await input.db.entitlement.findFirst({
    where: {
      organizationId: input.organizationId,
      code: input.entitlementCode,
      product: { code: { in: productCodeAliases(input.productCode) } },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    select: {
      id: true,
      limitValue: true,
      endsAt: true,
      status: { select: { code: true } },
      subscription: {
        select: {
          status: { select: { code: true } },
          endsAt: true,
        },
      },
    },
  });

  if (!row) {
    return {
      allowed: false,
      value: null,
      reason: "ENTITLEMENT_MISSING",
      subscriptionStatus: null,
      expiresAt: null,
    };
  }

  const subStatus = row.subscription.status.code;
  if (
    row.status.code !== MASTER.entitlementStatus.ACTIVE ||
    subStatus === MASTER.subscriptionStatus.SUSPENDED ||
    subStatus === MASTER.subscriptionStatus.CANCELLED ||
    subStatus === MASTER.subscriptionStatus.EXPIRED
  ) {
    return {
      allowed: false,
      value: row.limitValue,
      reason:
        row.status.code !== MASTER.entitlementStatus.ACTIVE
          ? `ENTITLEMENT_${row.status.code}`
          : `SUBSCRIPTION_${subStatus}`,
      subscriptionStatus: subStatus,
      expiresAt: (row.endsAt ?? row.subscription.endsAt)?.toISOString() ?? null,
    };
  }

  return {
    allowed: true,
    value: row.limitValue,
    reason: "OK",
    subscriptionStatus: subStatus,
    expiresAt: (row.endsAt ?? row.subscription.endsAt)?.toISOString() ?? null,
  };
}

export async function regenerateEntitlementsForSubscription(
  db: PrismaClient,
  input: {
    subscriptionId: string;
    actorAuthUserId: string;
  },
) {
  const subscription = await db.subscription.findUnique({
    where: { id: input.subscriptionId },
    select: { id: true, organizationId: true },
  });
  if (!subscription) {
    throw new Error("SUBSCRIPTION_NOT_FOUND");
  }
  const created = await generateEntitlementsForSubscription(
    db,
    subscription.id,
  );
  const action = await db.auditActionType.upsert({
    where: { code: "entitlement.regenerate" },
    create: {
      code: "entitlement.regenerate",
      nameTh: "สร้างสิทธิ์การใช้งานใหม่",
      nameEn: "Regenerate entitlements",
      sortOrder: 106,
      isActive: true,
      isSystem: true,
    },
    update: {},
  });
  await db.auditLog.create({
    data: {
      organizationId: subscription.organizationId,
      actorAuthUserId: input.actorAuthUserId,
      actionTypeId: action.id,
      entityType: "Subscription",
      entityId: subscription.id,
      afterJson: {
        entitlementCodes: created.map((row) => row.code),
        regenerated: true,
      },
    },
  });
  return created;
}

export function detectEntitlementConsistency(input: {
  snapshotJson: unknown;
  entitlementCodes: string[];
}): { stale: boolean; missing: string[]; extra: string[] } {
  const expected = featuresFromSnapshot(input.snapshotJson).map((f) => f.code);
  if (expected.length === 0) {
    return { stale: false, missing: [], extra: [] };
  }
  const have = new Set(input.entitlementCodes);
  const want = new Set(expected);
  const missing = expected.filter((c) => !have.has(c));
  const extra = input.entitlementCodes.filter((c) => !want.has(c));
  return {
    stale: missing.length > 0 || extra.length > 0,
    missing,
    extra,
  };
}
