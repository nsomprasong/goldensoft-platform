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
 * When a customer org is selected, sidebar switches to customer-support nav.
 * Selecting GOLDENSOFT restores full Platform Admin menus.
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
  const shellMode = resolvePlatformShellMode(props.activeOrganization);
  const customerAppOrigin = getPreferredCustomerAppOrigin();

  const nav =
    shellMode === "customer_support" && props.activeOrganization
      ? buildCustomerSupportNav({
          organizationId: props.activeOrganization.id,
          platformRoles: props.platformRoles,
          organizationRoles: props.organizationRoles,
          permissions: props.permissions,
          customerAppOrigin,
        })
      : filterNavForRoles({
          platformRoles: props.platformRoles,
          organizationRoles: props.organizationRoles,
          permissions: props.permissions,
          items: PLATFORM_NAV,
        }).map((item) => {
          if (item.href === "/branches" && props.activeOrganization) {
            return {
              ...item,
              href: `/organizations/${props.activeOrganization.id}/branches`,
            };
          }
          return item;
        });

  return (
    <AppShell
      displayName={props.displayName}
      roles={[...props.platformRoles, ...props.organizationRoles]}
      navItems={nav.map((item) => ({ href: item.href, label: item.label }))}
      organizations={props.organizations}
      platformAdminOrganizations={props.platformAdminOrganizations}
      managedOrganizations={props.managedOrganizations}
      branches={props.branches}
      activeOrganization={props.activeOrganization}
      activeBranch={props.activeBranch}
      contextMode={props.contextMode ?? "membership"}
      shellMode={shellMode}
      pageTitle={props.pageTitle}
      canUsePlatformAdminMode={props.platformRoles.includes("SUPER_ADMIN")}
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
