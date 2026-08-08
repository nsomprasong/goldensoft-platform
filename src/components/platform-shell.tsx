import { headers } from "next/headers";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { filterNavForRoles, PLATFORM_NAV } from "@/lib/auth/access";
import {
  buildCustomerSupportNav,
  resolvePlatformShellMode,
} from "@/lib/auth/shell-mode";
import { TH } from "@/lib/i18n/th";
import { getPreferredCustomerAppOrigin } from "@/lib/platform/customer-products";

/**
 * Platform Admin shell (“ศูนย์บริหาร GoldenSoft”).
 * Sidebar always shows full Platform menus; when a customer org is selected,
 * Customer App entry stays inside the menu only.
 */
export function PlatformShell(props: {
  children: ReactNode;
  displayName: string;
  platformRoles: string[];
  organizationRoles: string[];
  organizations: Array<{ id: string; name: string; customerCode?: string | null }>;
  platformAdminOrganizations?: Array<{
    id: string;
    name: string;
    customerCode?: string | null;
  }>;
  managedOrganizations?: Array<{
    id: string;
    name: string;
    customerCode?: string | null;
  }>;
  /** True if this actor has an active customer portfolio to switch into. */
  canUseManagedOrgMode?: boolean;
  branches: Array<{ id: string; name: string; code: string }>;
  activeOrganization: {
    id: string;
    name: string;
    customerCode?: string | null;
  } | null;
  activeBranch: { id: string; name: string; code: string } | null;
  pageTitle?: string;
  contextMode?: "membership" | "platform_admin" | "managed_org";
  permissions?: string[];
}) {
  return <PlatformShellInner {...props} />;
}

async function PlatformShellInner(props: {
  children: ReactNode;
  displayName: string;
  platformRoles: string[];
  organizationRoles: string[];
  organizations: Array<{ id: string; name: string; customerCode?: string | null }>;
  platformAdminOrganizations?: Array<{
    id: string;
    name: string;
    customerCode?: string | null;
  }>;
  managedOrganizations?: Array<{
    id: string;
    name: string;
    customerCode?: string | null;
  }>;
  canUseManagedOrgMode?: boolean;
  branches: Array<{ id: string; name: string; code: string }>;
  activeOrganization: {
    id: string;
    name: string;
    customerCode?: string | null;
  } | null;
  activeBranch: { id: string; name: string; code: string } | null;
  pageTitle?: string;
  contextMode?: "membership" | "platform_admin" | "managed_org";
  permissions?: string[];
}) {
  const shellMode = resolvePlatformShellMode(props.activeOrganization);
  const customerAppItem =
    shellMode === "customer_support" && props.activeOrganization
      ? buildCustomerSupportNav({
          organizationId: props.activeOrganization.id,
          platformRoles: props.platformRoles,
          organizationRoles: props.organizationRoles,
          permissions: props.permissions,
        }).find((item) => item.label === TH.nav.openCustomerApp)
      : undefined;
  const navSource = customerAppItem
    ? [PLATFORM_NAV[0], customerAppItem, ...PLATFORM_NAV.slice(1)]
    : PLATFORM_NAV;

  const nav = filterNavForRoles({
    platformRoles: props.platformRoles,
    organizationRoles: props.organizationRoles,
    permissions: props.permissions,
    items: navSource.filter((item) => item.href !== "/branches"),
  }).map((item) => {
    if (item.href === "/branches" && props.activeOrganization) {
      return {
        ...item,
        href: `/organizations/${props.activeOrganization.id}/branches`,
      };
    }
    return item;
  });

  const navItems = nav.map((item) => ({ href: item.href, label: item.label }));
  const headerList = await headers();
  const requestHost =
    headerList.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    headerList.get("host");
  const customerOrigin = getPreferredCustomerAppOrigin(process.env, requestHost);
  const customerModeHref = customerOrigin
    ? `${customerOrigin}/auth/callback?next=${encodeURIComponent("/hr/welcome")}&entry=customer`
    : null;

  return (
    <AppShell
      displayName={props.displayName}
      roles={[...props.platformRoles, ...props.organizationRoles]}
      navItems={navItems}
      organizations={props.organizations}
      platformAdminOrganizations={props.platformAdminOrganizations}
      managedOrganizations={props.managedOrganizations}
      branches={props.branches}
      activeOrganization={props.activeOrganization}
      activeBranch={props.activeBranch}
      contextMode={props.contextMode ?? "membership"}
      shellMode={shellMode}
      customerAppHref={customerAppItem?.href ?? customerModeHref}
      pageTitle={props.pageTitle}
      canUsePlatformAdminMode={props.platformRoles.length > 0}
      canUseManagedOrgMode={props.canUseManagedOrgMode}
    >
      {props.children}
    </AppShell>
  );
}

/** Re-export brand helper for auth layouts. */
export function BrandLockup({ subtitle }: { subtitle?: string }) {
  return (
    <div className="brand-mark">
      <span className="brand-mark-badge">GS</span>
      <span>
        {TH.brand}
        {subtitle ? (
          <span className="mt-0.5 block text-[0.75rem] font-medium text-[var(--text-muted)]">
            {subtitle}
          </span>
        ) : null}
      </span>
    </div>
  );
}
