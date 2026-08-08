import { filterNavForRoles, type NavItem } from "@/lib/auth/access";
import { TH } from "@/lib/i18n/th";
import { isGoldenSoftCustomerCode } from "@/lib/platform/bootstrap-organization";
import { getPreferredCustomerAppOrigin } from "@/lib/platform/customer-products";

export type PlatformShellMode = "platform" | "customer_support";

export type ActiveOrgForShell = {
  id: string;
  name: string;
  customerCode?: string | null;
};

/**
 * GoldenSoft (or no org) → Platform Admin menus.
 * Any other selected customer org → support menus for that tenant.
 */
export function resolvePlatformShellMode(
  activeOrganization: ActiveOrgForShell | null | undefined,
): PlatformShellMode {
  if (!activeOrganization?.id) return "platform";
  if (isGoldenSoftCustomerCode(activeOrganization.customerCode)) {
    return "platform";
  }
  return "customer_support";
}

/** Nav items while supporting a customer organization (sales / super admin). */
export function buildCustomerSupportNav(input: {
  organizationId: string;
  platformRoles: string[];
  organizationRoles: string[];
  permissions?: string[];
  customerAppOrigin?: string | null;
}): NavItem[] {
  const orgBase = `/organizations/${input.organizationId}`;
  const customerOrigin =
    input.customerAppOrigin ?? getPreferredCustomerAppOrigin();
  const customerAppHref = customerOrigin
    ? `${customerOrigin}/auth/callback?next=${encodeURIComponent("/hr/welcome")}&entry=customer`
    : null;

  const items: NavItem[] = [
    {
      href: orgBase,
      label: TH.nav.supportOrgOverview,
    },
    {
      href: `${orgBase}/branches`,
      label: TH.nav.branches,
      permission: "platform.branch.read",
    },
    {
      href: "/users",
      label: TH.nav.users,
      permission: "platform.user.read",
    },
    {
      href: "/users/invite",
      label: TH.nav.inviteUser,
      permission: "platform.user.invite",
    },
    {
      href: "/roles",
      label: TH.nav.roles,
      permission: "platform.role.read",
    },
    {
      href: "/subscriptions",
      label: TH.nav.subscriptions,
      permission: "platform.subscription.read",
    },
    {
      href: "/billing",
      label: TH.nav.billing,
      permission: "billing.account.read",
    },
    {
      href: "/organizations",
      label: input.platformRoles.includes("SUPER_ADMIN")
        ? TH.nav.organizations
        : TH.nav.myCustomers,
      permission: "platform.organization.read",
    },
  ];

  if (customerAppHref) {
    items.splice(1, 0, {
      href: customerAppHref,
      label: TH.nav.openCustomerApp,
    });
  }

  return filterNavForRoles({
    platformRoles: input.platformRoles,
    organizationRoles: input.organizationRoles,
    permissions: input.permissions,
    items,
  });
}
