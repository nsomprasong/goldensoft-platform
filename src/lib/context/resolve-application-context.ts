import type { PrismaClient } from "@prisma/client";

import type { ApplicationContext, SubscriptionSnapshot } from "@/lib/context/types";
import {
  ACTIVE_SUBSCRIPTION_STATUS_CODES,
  MASTER,
} from "@/lib/platform/master-codes";
import { parseSubscriptionSnapshot } from "@/lib/platform/snapshot";
import { permissionsForRoles } from "@/lib/permissions/codes";

export type ResolveContextInput = {
  authUserId: string;
  claimedOrganizationId?: string | null;
  claimedBranchId?: string | null;
  productCode: string;
  clientOrganizationId?: string | null;
};

export class ContextError extends Error {
  constructor(
    message: string,
    readonly code:
      | "UNAUTHENTICATED"
      | "PROFILE_NOT_FOUND"
      | "ORG_FORBIDDEN"
      | "BRANCH_FORBIDDEN"
      | "PRODUCT_FORBIDDEN"
      | "SUBSCRIPTION_MISSING"
      | "CLIENT_ORG_MISMATCH",
  ) {
    super(message);
    this.name = "ContextError";
  }
}

export async function resolveApplicationContext(
  db: PrismaClient,
  input: ResolveContextInput,
): Promise<ApplicationContext> {
  if (
    input.clientOrganizationId &&
    input.claimedOrganizationId &&
    input.clientOrganizationId !== input.claimedOrganizationId
  ) {
    throw new ContextError(
      "Client organizationId does not match verified context",
      "CLIENT_ORG_MISMATCH",
    );
  }

  const assignmentActive = await db.assignmentStatus.findUnique({
    where: { code: MASTER.assignmentStatus.ACTIVE },
  });
  if (!assignmentActive) {
    throw new ContextError("Master data incomplete", "PROFILE_NOT_FOUND");
  }

  const profile = await db.userProfile.findUnique({
    where: { authUserId: input.authUserId },
    include: {
      status: true,
      platformRoles: {
        where: { statusId: assignmentActive.id },
        include: { role: true },
      },
      preference: true,
    },
  });

  if (!profile || profile.status.code !== MASTER.userProfileStatus.ACTIVE) {
    throw new ContextError("User profile not found or disabled", "PROFILE_NOT_FOUND");
  }

  const candidateOrgId =
    input.claimedOrganizationId ??
    input.clientOrganizationId ??
    profile.preference?.lastOrganizationId ??
    null;

  if (!candidateOrgId) {
    throw new ContextError("No organization context available", "ORG_FORBIDDEN");
  }

  const branchActive = await db.branchStatus.findUnique({
    where: { code: MASTER.branchStatus.ACTIVE },
  });
  if (!branchActive) {
    throw new ContextError("Master data incomplete", "ORG_FORBIDDEN");
  }

  const membership = await db.organizationMembership.findUnique({
    where: {
      organizationId_userProfileId: {
        organizationId: candidateOrgId,
        userProfileId: profile.id,
      },
    },
    include: {
      status: true,
      roles: {
        where: { statusId: assignmentActive.id },
        include: { role: true },
      },
      branchScopes: {
        where: { statusId: assignmentActive.id },
        include: { scopeType: true },
      },
      organization: {
        include: {
          status: true,
          branches: {
            where: { statusId: branchActive.id, deletedAt: null },
          },
        },
      },
    },
  });

  if (
    !membership ||
    membership.status.code !== MASTER.membershipStatus.ACTIVE
  ) {
    throw new ContextError(
      "Not a member of the requested organization",
      "ORG_FORBIDDEN",
    );
  }

  if (membership.organization.status.code !== MASTER.organizationStatus.ACTIVE) {
    throw new ContextError("Organization is not active", "ORG_FORBIDDEN");
  }

  const accessibleBranchIds = resolveAccessibleBranches(
    membership.branchScopes.map((s) => ({
      scopeType: s.scopeType.code,
      branchId: s.branchId,
    })),
    membership.organization.branches.map((b) => b.id),
  );

  const claimedBranchId =
    input.claimedBranchId !== undefined
      ? input.claimedBranchId
      : (profile.preference?.lastBranchId ?? null);

  const activeBranchId: string | null = claimedBranchId;
  if (
    activeBranchId !== null &&
    !accessibleBranchIds.includes(activeBranchId)
  ) {
    throw new ContextError(
      "Branch is outside the member scope",
      "BRANCH_FORBIDDEN",
    );
  }

  const product = await db.product.findUnique({
    where: { code: input.productCode },
    include: { status: true },
  });
  if (!product || product.status.code !== MASTER.productStatus.ACTIVE) {
    throw new ContextError("Product not available", "PRODUCT_FORBIDDEN");
  }

  const productMembership = await db.organizationProductMembership.findUnique({
    where: {
      organizationId_userProfileId_productId: {
        organizationId: membership.organizationId,
        userProfileId: profile.id,
        productId: product.id,
      },
    },
    include: { status: true },
  });

  if (
    !productMembership ||
    productMembership.status.code !== MASTER.productMembershipStatus.ACTIVE
  ) {
    throw new ContextError(
      "No product membership for this organization",
      "PRODUCT_FORBIDDEN",
    );
  }

  const activeSubStatuses = await db.subscriptionStatus.findMany({
    where: { code: { in: [...ACTIVE_SUBSCRIPTION_STATUS_CODES] } },
    select: { id: true },
  });

  const subscription = await db.subscription.findFirst({
    where: {
      organizationId: membership.organizationId,
      productId: product.id,
      statusId: { in: activeSubStatuses.map((s) => s.id) },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription) {
    throw new ContextError(
      "Organization has no active subscription for this product",
      "SUBSCRIPTION_MISSING",
    );
  }

  const snapshot: SubscriptionSnapshot = parseSubscriptionSnapshot(
    subscription.snapshotJson,
  );

  const platformRoles = profile.platformRoles.map((r) => r.role.code);
  const organizationRoles = membership.roles.map((r) => r.role.code);
  const permissions = permissionsForRoles({ platformRoles, organizationRoles });

  return {
    authUserId: input.authUserId,
    organizationId: membership.organizationId,
    activeBranchId,
    accessibleBranchIds,
    productCode: product.code,
    platformRoles,
    organizationRoles,
    permissions,
    planCode: snapshot.planCode,
    features: snapshot.featureCodes,
    limits: snapshot.limits,
  };
}

export function resolveAccessibleBranches(
  scopes: Array<{ scopeType: string; branchId: string | null }>,
  allActiveBranchIds: string[],
): string[] {
  if (scopes.some((s) => s.scopeType === "NONE")) {
    return [];
  }
  if (scopes.some((s) => s.scopeType === "ALL_BRANCHES")) {
    return [...allActiveBranchIds];
  }
  return scopes
    .filter((s) => s.scopeType === "SELECTED" && s.branchId)
    .map((s) => s.branchId as string)
    .filter((id) => allActiveBranchIds.includes(id));
}
