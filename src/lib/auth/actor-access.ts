import type { PrismaClient } from "@prisma/client";
import { cache } from "react";

import { loadPlatformUserBundle } from "@/lib/auth/platform-user";
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
  _db: PrismaClient,
  authUserId: string,
): Promise<ResolvedActorAccess> {
  const bundle = await loadPlatformUserBundle(authUserId);
  if (!bundle.profile) {
    return emptyAccess(authUserId);
  }

  return {
    authUserId,
    profileId: bundle.profile.id,
    platformRoles: bundle.platformRoles,
    membershipOrganizationIds: bundle.memberships.map((m) => m.organizationId),
    organizationRoles: bundle.memberships.flatMap((m) => m.roles),
    organizationRolesByOrganization: Object.fromEntries(
      bundle.memberships.map((membership) => [
        membership.organizationId,
        membership.roles,
      ]),
    ),
  };
});
