"use client";

import { Building2, GitBranch } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { TH } from "@/lib/i18n/th";
import {
  signalNavigationDone,
  signalNavigationPending,
} from "@/lib/navigation-pending";

type OrgOption = { id: string; name: string };
type BranchOption = { id: string; name: string; code: string };

export function ContextSwitcher(props: {
  organizations: OrgOption[];
  platformAdminOrganizations?: OrgOption[];
  managedOrganizations?: OrgOption[];
  branches: BranchOption[];
  activeOrganizationId: string | null;
  activeBranchId: string | null;
  contextMode?: "membership" | "platform_admin" | "managed_org";
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
    router.refresh();
  }

  return (
    <div className="context-switcher flex w-full flex-wrap items-stretch gap-2 text-[length:var(--text-helper)]">
      {props.contextMode === "platform_admin" ? (
        <span className="inline-flex items-center rounded-full border border-[var(--page-header-border)] bg-gradient-to-r from-[var(--primary-soft)] to-[#fff7ed] px-2.5 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--primary)] shadow-[var(--shadow-xs)]">
          โหมดผู้ดูแลแพลตฟอร์ม
        </span>
      ) : null}
      {props.contextMode === "managed_org" ? (
        <span className="inline-flex items-center rounded-full border border-[var(--page-header-border)] bg-gradient-to-r from-[var(--primary-soft)] to-[#fff7ed] px-2.5 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--primary)] shadow-[var(--shadow-xs)]">
          {TH.staffPortfolio.managedOrgModeBadge}
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
                  </option>
                ))}
              </optgroup>
            ) : null}
            {adminOnly.length > 0 ? (
              <optgroup label="โหมดผู้ดูแลแพลตฟอร์ม">
                {adminOnly.map((org) => (
                  <option key={`admin-${org.id}`} value={org.id}>
                    {org.name}
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
          </select>
        </span>
      </label>

      {props.branches.length > 0 ? (
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
                const branchId = e.target.value || null;
                if (!props.activeOrganizationId) return;
                start(() =>
                  switchContext(props.activeOrganizationId!, branchId),
                );
              }}
            >
              <option value="">{TH.common.noBranch}</option>
              {props.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </span>
        </label>
      ) : null}

      {error ? (
        <span className="w-full text-[var(--danger)] sm:w-auto" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
