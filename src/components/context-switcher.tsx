"use client";

import { Building2, GitBranch } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { TH } from "@/lib/i18n/th";
import {
  signalNavigationDone,
  signalNavigationPending,
} from "@/lib/navigation-pending";

type OrgOption = {
  id: string;
  name: string;
  customerCode?: string | null;
};
type BranchOption = { id: string; name: string; code: string };

function isGoldenSoftOrg(customerCode: string | null | undefined): boolean {
  return (customerCode ?? "").trim().toUpperCase() === "GOLDENSOFT";
}

export function ContextSwitcher(props: {
  organizations: OrgOption[];
  platformAdminOrganizations?: OrgOption[];
  managedOrganizations?: OrgOption[];
  branches: BranchOption[];
  activeOrganizationId: string | null;
  activeBranchId: string | null;
  contextMode?: "membership" | "platform_admin" | "managed_org";
  shellMode?: "platform" | "customer_support";
  canUsePlatformAdminMode?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const adminOrgs = props.platformAdminOrganizations ?? [];
  const managedOrgs = props.managedOrganizations ?? [];
  const membershipIds = new Set(props.organizations.map((o) => o.id));
  const adminOnly = props.canUsePlatformAdminMode
    ? adminOrgs.filter((o) => !membershipIds.has(o.id))
    : [];
  const managedOnly = managedOrgs.filter(
    (o) => !membershipIds.has(o.id) && !adminOnly.some((a) => a.id === o.id),
  );
  const allOptions = [...props.organizations, ...adminOnly, ...managedOnly];

  function destinationForOrg(org: OrgOption | undefined): string {
    if (!org) return "/";
    if (isGoldenSoftOrg(org.customerCode)) return "/";
    return `/organizations/${org.id}`;
  }

  async function switchContext(
    organizationId: string,
    branchId: string | null,
    mode?: "managed_org",
  ) {
    setError(null);
    signalNavigationPending();
    const res = await fetch("/api/platform/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, branchId, mode }),
    });
    if (!res.ok) {
      setError(TH.access.forbidden);
      signalNavigationDone();
      return;
    }
    const org = allOptions.find((row) => row.id === organizationId);
    router.push(destinationForOrg(org));
    router.refresh();
  }

  const showSupportBadge =
    props.shellMode === "customer_support" ||
    props.contextMode === "managed_org" ||
    (props.contextMode === "platform_admin" &&
      props.shellMode !== "platform");

  return (
    <div className="context-switcher flex w-full flex-wrap items-stretch gap-2 text-[length:var(--text-helper)]">
      {showSupportBadge ? (
        <span className="inline-flex items-center rounded-full border border-[var(--page-header-border)] bg-gradient-to-r from-[var(--primary-soft)] to-[#fff7ed] px-2.5 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--primary)] shadow-[var(--shadow-xs)]">
          {TH.nav.customerSupportBadge}
        </span>
      ) : props.contextMode === "platform_admin" ? (
        <span className="inline-flex items-center rounded-full border border-[var(--page-header-border)] bg-gradient-to-r from-[var(--primary-soft)] to-[#fff7ed] px-2.5 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--primary)] shadow-[var(--shadow-xs)]">
          {TH.nav.platformHomeBadge}
        </span>
      ) : null}

      <label className="context-chip context-chip--org">
        <span className="context-chip-icon" aria-hidden="true">
          <Building2 className="size-4" />
        </span>
        <span className="context-chip-body">
          <span className="context-chip-label">{TH.nav.switchOrganization}</span>
          <select
            className="context-chip-select"
            aria-label={TH.nav.switchOrganization}
            disabled={pending || allOptions.length === 0}
            value={props.activeOrganizationId ?? ""}
            suppressHydrationWarning
            onChange={(e) => {
              const orgId = e.target.value;
              const mode = managedOnly.some((o) => o.id === orgId)
                ? "managed_org"
                : undefined;
              start(() => switchContext(orgId, null, mode));
            }}
          >
            {props.organizations.length > 0 ? (
              <optgroup label="องค์กรที่คุณเป็นสมาชิก">
                {props.organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                    {isGoldenSoftOrg(org.customerCode) ? " (Platform)" : ""}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {adminOnly.length > 0 ? (
              <optgroup label="องค์กรลูกค้า (Super Admin)">
                {adminOnly.map((org) => (
                  <option key={`admin-${org.id}`} value={org.id}>
                    {org.name}
                    {isGoldenSoftOrg(org.customerCode) ? " (Platform)" : ""}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {managedOnly.length > 0 ? (
              <optgroup label={TH.staffPortfolio.managedOrgGroupLabel}>
                {managedOnly.map((org) => (
                  <option key={`managed-${org.id}`} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {allOptions.length === 0 ? (
              <option value="" disabled>
                {TH.common.notFound}
              </option>
            ) : null}
          </select>
        </span>
      </label>

      <label className="context-chip context-chip--branch">
        <span className="context-chip-icon" aria-hidden="true">
          <GitBranch className="size-4" />
        </span>
        <span className="context-chip-body">
          <span className="context-chip-label">{TH.nav.switchBranch}</span>
          <select
            className="context-chip-select"
            aria-label={TH.nav.switchBranch}
            disabled={pending || !props.activeOrganizationId}
            value={props.activeBranchId ?? ""}
            suppressHydrationWarning
            onChange={(e) => {
              if (!props.activeOrganizationId) return;
              const mode = managedOnly.some(
                (o) => o.id === props.activeOrganizationId,
              )
                ? "managed_org"
                : undefined;
              start(() =>
                switchContext(
                  props.activeOrganizationId!,
                  e.target.value || null,
                  mode,
                ),
              );
            }}
          >
            <option value="">{TH.common.noBranch}</option>
            {props.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </span>
      </label>

      {error ? (
        <span className="text-[length:var(--text-caption)] text-[var(--danger)]">
          {error}
        </span>
      ) : null}
    </div>
  );
}
