export const DATA_RESET_CONFIRM_PHRASE = "ล้างข้อมูล";
export const PROTECTED_ORG_CODE = "GOLDENSOFT";

export type DataResetSelection = {
  selectAll: boolean;
  organizationIds: string[];
  branchIds: string[];
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
  orphanProfiles: { id: string; email: string }[];
  counts: Record<string, number | string>;
  warnings: string[];
};
