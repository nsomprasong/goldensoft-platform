/** Stable master codes used by services (never rename once referenced). */

export const MASTER = {
  userProfileStatus: {
    ACTIVE: "ACTIVE",
    DISABLED: "DISABLED",
    PENDING: "PENDING",
  },
  platformRole: {
    SUPER_ADMIN: "SUPER_ADMIN",
    SUPPORT: "SUPPORT",
    BILLING_ADMIN: "BILLING_ADMIN",
  },
  assignmentStatus: {
    ACTIVE: "ACTIVE",
    REVOKED: "REVOKED",
  },
  organizationStatus: {
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    CLOSED: "CLOSED",
  },
  branchStatus: {
    ACTIVE: "ACTIVE",
    INACTIVE: "INACTIVE",
  },
  membershipStatus: {
    INVITED: "INVITED",
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    REMOVED: "REMOVED",
  },
  organizationRole: {
    OWNER: "OWNER",
    ADMIN: "ADMIN",
    BILLING_CONTACT: "BILLING_CONTACT",
  },
  branchScopeType: {
    ALL_BRANCHES: "ALL_BRANCHES",
    SELECTED: "SELECTED",
    NONE: "NONE",
  },
  productStatus: {
    ACTIVE: "ACTIVE",
    RETIRED: "RETIRED",
  },
  featureStatus: {
    ACTIVE: "ACTIVE",
    RETIRED: "RETIRED",
  },
  planStatus: {
    ACTIVE: "ACTIVE",
    RETIRED: "RETIRED",
  },
  planVersionStatus: {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    RETIRED: "RETIRED",
  },
  billingCycle: {
    MONTHLY: "MONTHLY",
    YEARLY: "YEARLY",
    MANUAL: "MANUAL",
  },
  subscriptionStatus: {
    TRIAL: "TRIAL",
    ACTIVE: "ACTIVE",
    PAST_DUE: "PAST_DUE",
    SUSPENDED: "SUSPENDED",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
  },
  subscriptionOverrideType: {
    GRANT: "GRANT",
    REVOKE: "REVOKE",
    LIMIT: "LIMIT",
  },
  productMembershipStatus: {
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    REVOKED: "REVOKED",
  },
  outboxEventStatus: {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    PROCESSED: "PROCESSED",
    FAILED: "FAILED",
    DEAD: "DEAD",
  },
  idempotencyStatus: {
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
  },
  legacyMigrationStatus: {
    PENDING: "PENDING",
    LINKED: "LINKED",
    MIGRATED: "MIGRATED",
    FAILED: "FAILED",
    IGNORED: "IGNORED",
  },
  featureValueType: {
    STRING: "STRING",
    NUMBER: "NUMBER",
    BOOLEAN: "BOOLEAN",
  },
  auditActionType: {
    ORGANIZATION_BOOTSTRAP: "organization.bootstrap",
    ORGANIZATION_ROLE_REVOKE: "organization.role.revoke",
    BRANCH_CREATE: "branch.create",
    SUBSCRIPTION_CREATE: "subscription.create",
  },
} as const;

export const ACTIVE_SUBSCRIPTION_STATUS_CODES = [
  MASTER.subscriptionStatus.TRIAL,
  MASTER.subscriptionStatus.ACTIVE,
  MASTER.subscriptionStatus.PAST_DUE,
  MASTER.subscriptionStatus.SUSPENDED,
] as const;
