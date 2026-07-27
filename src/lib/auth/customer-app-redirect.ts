import type { PrismaClient } from "@prisma/client";

import { resolvePostLoginRedirect } from "@/lib/auth/post-login-redirect";
import { listEntitlementsForOrganization } from "@/lib/platform/entitlements";
import {
  getPreferredCustomerAppOrigin,
  pickCustomerProductHomePath,
} from "@/lib/platform/customer-products";

/**
 * True when the user is a GoldenSoft employee (has any platform role).
 * Organization OWNER/ADMIN customers have memberships only — no platform roles.
 */
export function isGoldenSoftPlatformStaff(
  platformRoles: string[] | undefined,
): boolean {
  return (platformRoles ?? []).length > 0;
}

type MembershipRef = { organizationId: string };

/**
 * Absolute Customer App URL after Central Login for tenant users.
 * Uses `/auth/callback?next=…` so the customer host can verify the session.
 */
export async function resolveCustomerAppEntryUrl(
  db: PrismaClient,
  input: {
    memberships: MembershipRef[];
    /** Already-validated absolute customer URL from `?next=` if present. */
    preferredNext?: string | null;
  },
): Promise<string | null> {
  const preferred = input.preferredNext?.trim() || null;
  if (preferred) {
    const resolved = resolvePostLoginRedirect(preferred);
    if (!resolved.startsWith("/") && !resolved.startsWith("//")) {
      return resolved;
    }
  }

  const origin = getPreferredCustomerAppOrigin();
  if (!origin) return null;

  let nextPath = "/";
  if (input.memberships.length > 1) {
    nextPath = "/select-organization";
  } else if (input.memberships.length === 1) {
    const orgId = input.memberships[0]!.organizationId;
    const entitlements = await listEntitlementsForOrganization(db, orgId);
    const inactiveSub = new Set(["SUSPENDED", "CANCELLED", "EXPIRED"]);
    const activeCodes = entitlements
      .filter((row) => {
        const entitlementOk =
          row.status.code === "ACTIVE" || row.status.code === "TRIAL";
        const subStatus = row.subscription?.status.code ?? null;
        const subOk = !subStatus || !inactiveSub.has(subStatus);
        return entitlementOk && subOk;
      })
      .map((row) => row.code);
    nextPath = pickCustomerProductHomePath(activeCodes);
  }

  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", nextPath);
  return url.toString();
}
