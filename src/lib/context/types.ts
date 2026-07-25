export type ApplicationContext = {
  authUserId: string;
  organizationId: string;
  activeBranchId: string | null;
  accessibleBranchIds: string[];
  productCode: string;
  platformRoles: string[];
  organizationRoles: string[];
  permissions: string[];
  planCode: string | null;
  features: string[];
  limits: Record<string, number | boolean | string>;
};

export type SubscriptionSnapshot = {
  schemaVersion: number;
  productCode: string;
  planCode: string;
  planVersion: number;
  planName: string;
  currency: string;
  billingCycle: string;
  basePrice: number;
  featureCodes: string[];
  limits: Record<string, number | boolean | string>;
  capturedAt: string;
};

export { ACTIVE_SUBSCRIPTION_STATUS_CODES as ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/platform/master-codes";
