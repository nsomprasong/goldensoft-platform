import type { BillingCycle, Plan, PlanVersion, Product } from "@prisma/client";

import type { SubscriptionSnapshot } from "@/lib/context/types";

export function buildSubscriptionSnapshot(input: {
  product: Product;
  plan: Plan;
  planVersion: PlanVersion;
  billingCycle: BillingCycle;
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
    billingCycle: input.billingCycle,
    basePrice: input.planVersion.priceAmount,
    featureCodes: [...input.featureCodes].sort(),
    limits: { ...input.limits },
    capturedAt: (input.capturedAt ?? new Date()).toISOString(),
  };
}

export function parseSubscriptionSnapshot(json: string): SubscriptionSnapshot {
  const parsed = JSON.parse(json) as SubscriptionSnapshot;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.schemaVersion !== "number" ||
    typeof parsed.productCode !== "string" ||
    !Array.isArray(parsed.featureCodes)
  ) {
    throw new Error("Invalid subscription snapshot");
  }
  return parsed;
}

export function assertSnapshotImmutable(
  existingJson: string,
  nextJson: string,
): void {
  if (existingJson !== nextJson) {
    throw new Error(
      "Subscription snapshot is immutable after activation — create a revision instead",
    );
  }
}
