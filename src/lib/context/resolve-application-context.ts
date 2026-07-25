import type { PrismaClient } from "@prisma/client";

import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  type ApplicationContext,
  type SubscriptionSnapshot,
} from "@/lib/context/types";
import { parseSubscriptionSnapshot } from "@/lib/platform/snapshot";
import { permissionsForRoles } from "@/lib/permissions/codes";

export type ResolveContextInput = {
  authUserId: string;
  /** Claimed values from cookie only — never trusted without membership checks */
  claimedOrganizationId?: string | null;
  claimedBranchId?: string | null;
  productCode: string;
  /** Reject if client sends a different organizationId than claimed/cookie */
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

  if (
    input.clientOrganizationId &&
    !input.claimedOrganizationId
  ) {
    // Client-supplied org without server cookie/preference still must be verified
    // via membership below using clientOrganizationId as candidate.
  }

  const profile = await db.userProfile.findUnique({
    where: { authUserId: input.authUserId },
    include: {
      platformRoles: { where: { status: "ACTIVE" } },
      preference: true,
    },
  });

  if (!profile || profile.status !== "ACTIVE") {
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

  // Never trust client org alone — always verify membership
  const membership = await db.organizationMembership.findUnique({
    where: {
      organizationId_userProfileId: {
        organizationId: candidateOrgId,
        userProfileId: profile.id,
      },
    },
    include: {
      roles: { where: { status: "ACTIVE" } },
      branchScopes: { where: { status: "ACTIVE" } },
      organization: {
        include: { branches: { where: { status: "ACTIVE", deletedAt: null } } },
      },
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    throw new ContextError(
      "Not a member of the requested organization",
      "ORG_FORBIDDEN",
    );
  }

  if (membership.organization.status !== "ACTIVE") {
    throw new ContextError("Organization is not active", "ORG_FORBIDDEN");
  }

  const accessibleBranchIds = resolveAccessibleBranches(
    membership.branchScopes.map((s) => ({
      scopeType: s.scopeType,
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
  });
  if (!product || product.status !== "ACTIVE") {
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
  });

  if (!productMembership || productMembership.status !== "ACTIVE") {
    throw new ContextError(
      "No product membership for this organization",
      "PRODUCT_FORBIDDEN",
    );
  }

  const subscription = await db.subscription.findFirst({
    where: {
      organizationId: membership.organizationId,
      productId: product.id,
      status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
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

  const platformRoles = profile.platformRoles.map((r) => r.role);
  const organizationRoles = membership.roles.map((r) => r.role);
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
