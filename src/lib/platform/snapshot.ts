import type { Plan, PlanVersion, Product, Prisma } from "@prisma/client";

import type { SubscriptionSnapshot } from "@/lib/context/types";

export function buildSubscriptionSnapshot(input: {
  product: Pick<Product, "code">;
  plan: Pick<Plan, "code" | "name">;
  planVersion: Pick<PlanVersion, "versionNumber" | "currency" | "priceAmount">;
  billingCycleCode: string;
  featureCodes: string[];
  limits: Record<string, number | boolean | string>;
  capturedAt?: Date;
}): SubscriptionSnapshot {
  return {
    schemaVersion: 1,
    productCode: input.product.code,
    planCode: input.plan.code,
    planVersion: input.planVersion.versionNumber,
    planName: input.plan.name,
    currency: input.planVersion.currency,
    billingCycle: input.billingCycleCode,
    basePrice: Number(input.planVersion.priceAmount),
    featureCodes: [...input.featureCodes].sort(),
    limits: { ...input.limits },
    capturedAt: (input.capturedAt ?? new Date()).toISOString(),
  };
}

export function parseSubscriptionSnapshot(
  value: Prisma.JsonValue | string,
): SubscriptionSnapshot {
  const parsed =
    typeof value === "string" ? (JSON.parse(value) as unknown) : value;

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    typeof (parsed as SubscriptionSnapshot).schemaVersion !== "number" ||
    typeof (parsed as SubscriptionSnapshot).productCode !== "string" ||
    !Array.isArray((parsed as SubscriptionSnapshot).featureCodes)
  ) {
    throw new Error("Invalid subscription snapshot");
  }
  return parsed as SubscriptionSnapshot;
}

export function assertSnapshotImmutable(
  existing: Prisma.JsonValue | string,
  next: Prisma.JsonValue | string,
): void {
  const left = JSON.stringify(parseSubscriptionSnapshot(existing));
  const right = JSON.stringify(parseSubscriptionSnapshot(next));
  if (left !== right) {
    throw new Error(
      "Subscription snapshot is immutable after activation — create a revision instead",
    );
  }
}
