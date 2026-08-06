import type { PrismaClient } from "@prisma/client";
import { cache } from "react";

import { loadPlatformUserBundle } from "@/lib/auth/platform-user";
import { listActiveManagedOrganizationIds } from "@/lib/platform/customer-portfolio";
import { isGoldenSoftPlatformStaff } from "@/lib/auth/customer-app-redirect";
import { GOLDENSOFT_CUSTOMER_CODE } from "@/lib/platform/organization-identity";
import type { ActorAccess } from "@/lib/platform/organizations-admin";

export type ResolvedActorAccess = ActorAccess & {
  organizationRoles: string[];
  organizationRolesByOrganization: Record<string, string[]>;
  profileId: string | null;
};

function emptyAccess(authUserId: string): ResolvedActorAccess {
  return {
    authUserId,
    platformRoles: [],
    membershipOrganizationIds: [],
    managedOrganizationIds: [],
    internalViewOrganizationIds: [],
    organizationRoles: [],
    organizationRolesByOrganization: {},
    profileId: null,
  };
}

/**
 * Request-scoped via React cache(): pages, guards and helpers that need actor
 * permissions in one request share a single resolution. Reuses
 * loadPlatformUserBundle so dashboard/admin pages do not pay a second profile
 * round-trip after requirePlatformPage.
 */
export const loadActorAccess = cache(async function loadActorAccess(
  db: PrismaClient,
  authUserId: string,
): Promise<ResolvedActorAccess> {
  const bundle = await loadPlatformUserBundle(authUserId);
  if (!bundle.profile) {
    return emptyAccess(authUserId);
  }

  const managedOrganizationIds = await listActiveManagedOrganizationIds(
    db,
    bundle.profile.id,
  );
  const internalViewOrganizationIds = isGoldenSoftPlatformStaff(
    bundle.platformRoles,
  )
    ? (
        await db.organization.findMany({
          where: {
            customerCode: GOLDENSOFT_CUSTOMER_CODE,
            deletedAt: null,
            status: { code: "ACTIVE" },
          },
          select: { id: true },
        })
      ).map((organization) => organization.id)
    : [];

  return {
    authUserId,
    profileId: bundle.profile.id,
    platformRoles: bundle.platformRoles,
    membershipOrganizationIds: bundle.memberships.map((m) => m.organizationId),
    managedOrganizationIds,
    internalViewOrganizationIds,
    organizationRoles: bundle.memberships.flatMap((m) => m.roles),
    organizationRolesByOrganization: Object.fromEntries(
      bundle.memberships.map((membership) => [
        membership.organizationId,
        membership.roles,
      ]),
    ),
  };
});
