"use client";

import { Building2, GitBranch, Settings2 } from "lucide-react";
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { TH } from "@/lib/i18n/th";
import { pathAfterOrganizationSwitch } from "@/lib/navigation/stay-on-page";
import {
  signalNavigationDone,
  signalNavigationPending,
} from "@/lib/navigation-pending";
import { isGoldenSoftCustomerCode } from "@/lib/platform/organization-identity";

import styles from "./context-switcher.module.css";

type ContextMode = "membership" | "platform_admin" | "managed_org";

type OrgOption = {
  id: string;
  name: string;
  customerCode?: string | null;
};
type BranchOption = { id: string; name: string; code: string };

export function ContextSwitcher(props: {
  organizations: OrgOption[];
  platformAdminOrganizations?: OrgOption[];
  managedOrganizations?: OrgOption[];
  branches: BranchOption[];
  activeOrganizationId: string | null;
  activeBranchId: string | null;
  contextMode?: ContextMode;
  shellMode?: "platform" | "customer_support";
  customerAppHref?: string | null;
  canUsePlatformAdminMode?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
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
  const goldenSoftOptions = allOptions.filter((org) =>
    isGoldenSoftCustomerCode(org.customerCode),
  );
  const responsibleOrganizations = allOptions
    .filter(
      (org) => !isGoldenSoftCustomerCode(org.customerCode),
    )
    .sort((left, right) => left.name.localeCompare(right.name, "th"));
  const activeOrganizationName =
    allOptions.find((organization) => organization.id === props.activeOrganizationId)?.name ??
    "เลือกองค์กร";
  const activeBranchName =
    props.branches.find((branch) => branch.id === props.activeBranchId)?.name ??
    TH.common.noBranch;

  async function switchContext(
    organizationId: string,
    branchId: string | null,
    mode: ContextMode,
    destination?: string | null,
  ) {
    setError(null);
    signalNavigationPending();
    try {
      const res = await fetch("/api/platform/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          branchId,
          branchSelected: true,
          mode,
        }),
      });
      if (!res.ok) {
        setError(TH.access.forbidden);
        signalNavigationDone();
        return;
      }
      if (destination) {
        window.location.assign(destination);
        return;
      }
      const selectedOrganization = allOptions.find(
        (option) => option.id === organizationId,
      );
      const context =
        mode === "platform_admin" &&
        isGoldenSoftCustomerCode(selectedOrganization?.customerCode)
          ? "platform"
          : "organization";
      const rewritten = pathAfterOrganizationSwitch(pathname, organizationId, {
        context,
        branchId,
      });
      if (rewritten && rewritten !== pathname) router.push(rewritten);
      router.refresh();
    } catch {
      setError(TH.access.forbidden);
      signalNavigationDone();
    }
  }

  function resolvedMode(organizationId: string): ContextMode {
    const organization = allOptions.find((option) => option.id === organizationId);
    if (
      props.canUsePlatformAdminMode &&
      isGoldenSoftCustomerCode(organization?.customerCode)
    ) {
      return "platform_admin";
    }
    return managedOnly.some((option) => option.id === organizationId)
      ? "managed_org"
      : "membership";
  }

  return (
    <div className={`context-switcher flex w-full flex-nowrap items-stretch gap-2 text-[length:var(--text-helper)] ${styles.switcher}`}>
      <label className={`context-chip context-chip--org ${styles.chip}`} title={`องค์กร: ${activeOrganizationName}`}>
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
              const mode = resolvedMode(orgId);
              start(() => switchContext(orgId, null, mode));
            }}
          >
            {(props.shellMode === "customer_support" ? [] : goldenSoftOptions).map((org) => (
              <option key={`platform-${org.id}`} value={org.id}>
                {org.name} (Platform)
              </option>
            ))}
            {props.shellMode === "customer_support" && responsibleOrganizations.length > 0 ? (
              <optgroup label={TH.nav.responsibleOrganizations}>
                {responsibleOrganizations.map((org) => (
                  <option key={`responsible-${org.id}`} value={org.id}>
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

      <label className={`context-chip context-chip--branch ${styles.chip}`} title={`สาขา: ${activeBranchName}`}>
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
              const mode = props.contextMode ?? resolvedMode(props.activeOrganizationId);
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

      {goldenSoftOptions.length > 0 && responsibleOrganizations.length > 0 ? (
        <label className={`context-chip context-chip--mode ${styles.chip}`} title={`โหมด: ${props.shellMode === "customer_support" ? "ซัพพอร์ตลูกค้า" : "GoldenSoft"}`}>
          <span className="context-chip-icon" aria-hidden="true">
            <Settings2 className="size-4" />
          </span>
          <span className="context-chip-body">
            <span className="context-chip-label">โหมด</span>
            <select
              className="context-chip-select"
              aria-label="เลือกโหมดการทำงาน"
              disabled={pending}
              value={props.shellMode === "customer_support" ? "customer_support" : "platform"}
              onChange={(event) => {
                if (event.target.value === "platform") {
                  const target = goldenSoftOptions[0];
                  if (target) start(() => switchContext(target.id, null, "platform_admin"));
                  return;
                }
                const target = responsibleOrganizations.find(
                  (row) => row.id === props.activeOrganizationId,
                ) ?? responsibleOrganizations[0];
                if (!target) return;
                start(() =>
                  switchContext(
                    target.id,
                    null,
                    resolvedMode(target.id),
                    props.customerAppHref,
                  ),
                );
              }}
            >
              <option value="platform">GoldenSoft</option>
              <option value="customer_support">ซัพพอร์ตลูกค้า</option>
            </select>
          </span>
        </label>
      ) : null}

      {error ? (
        <span className="context-switcher-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
