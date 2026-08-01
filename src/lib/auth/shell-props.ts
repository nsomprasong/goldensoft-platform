import type { PlatformUserBundle } from "@/lib/auth/platform-user";

/** Org options for ContextSwitcher — includes customerCode for shell-mode routing. */
export function membershipOrganizationOptions(
  bundle: Pick<PlatformUserBundle, "memberships">,
): Array<{ id: string; name: string; customerCode: string | null }> {
  return bundle.memberships.map((m) => ({
    id: m.organizationId,
    name: m.organizationName,
    customerCode: m.customerCode ?? null,
  }));
}
