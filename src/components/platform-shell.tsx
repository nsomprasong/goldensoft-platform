import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { filterNavForRoles } from "@/lib/auth/access";
import { TH } from "@/lib/i18n/th";

export function PlatformShell(props: {
  children: ReactNode;
  displayName: string;
  platformRoles: string[];
  organizationRoles: string[];
  organizations: Array<{ id: string; name: string }>;
  platformAdminOrganizations?: Array<{ id: string; name: string }>;
  branches: Array<{ id: string; name: string; code: string }>;
  activeOrganization: { id: string; name: string } | null;
  activeBranch: { id: string; name: string; code: string } | null;
  pageTitle?: string;
  contextMode?: "membership" | "platform_admin";
}) {
  const nav = filterNavForRoles({
    platformRoles: props.platformRoles,
    organizationRoles: props.organizationRoles,
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
      branches={props.branches}
      activeOrganization={props.activeOrganization}
      activeBranch={props.activeBranch}
      contextMode={props.contextMode ?? "membership"}
      pageTitle={props.pageTitle}
      canUsePlatformAdminMode={props.platformRoles.includes("SUPER_ADMIN")}
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
