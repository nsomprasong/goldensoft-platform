export const DATA_RESET_CONFIRM_PHRASE = "ล้างข้อมูล";
export const PROTECTED_ORG_CODE = "GOLDENSOFT";

export type DataResetSelection = {
  /** Wipe all non-GOLDENSOFT orgs + orphan profiles; keep SUPER_ADMIN. */
  selectAll: boolean;
  organizationIds: string[];
  branchIds: string[];
  productIds: string[];
  planIds: string[];
  subscriptionIds: string[];
};

export type DataResetTargetOrg = {
  id: string;
  customerCode: string;
  displayName: string;
  protected: boolean;
  branches: {
    id: string;
    code: string;
    name: string;
    protected: boolean;
  }[];
};

export type DataResetCatalogTargets = {
  products: { id: string; code: string; name: string; planCount: number }[];
  plans: {
    id: string;
    code: string;
    name: string;
    productId: string;
    productCode: string;
  }[];
  subscriptions: {
    id: string;
    organizationId: string;
    organizationCode: string;
    organizationName: string;
    productCode: string;
    planCode: string;
    statusCode: string;
  }[];
};

export type DataResetPreview = {
  mode: "reset_all" | "selected";
  keptOrganizationCodes: string[];
  keptSuperAdminEmails: string[];
  organizations: { id: string; customerCode: string; displayName: string }[];
  branches: {
    id: string;
    code: string;
    name: string;
    organizationId: string;
    organizationCode: string;
  }[];
  products: { id: string; code: string; name: string }[];
  plans: { id: string; code: string; name: string; productCode: string }[];
  subscriptions: {
    id: string;
    organizationCode: string;
    productCode: string;
    planCode: string;
  }[];
  orphanProfiles: { id: string; email: string }[];
  counts: Record<string, number | string>;
  warnings: string[];
};
