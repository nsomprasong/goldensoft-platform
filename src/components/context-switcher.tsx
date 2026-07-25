"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { TH } from "@/lib/i18n/th";

type OrgOption = { id: string; name: string };
type BranchOption = { id: string; name: string; code: string };

export function ContextSwitcher(props: {
  organizations: OrgOption[];
  platformAdminOrganizations?: OrgOption[];
  branches: BranchOption[];
  activeOrganizationId: string | null;
  activeBranchId: string | null;
  contextMode?: "membership" | "platform_admin";
  canUsePlatformAdminMode?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adminOrgs, setAdminOrgs] = useState<OrgOption[]>(
    props.platformAdminOrganizations ?? [],
  );

  useEffect(() => {
    if (!props.canUsePlatformAdminMode) return;
    if ((props.platformAdminOrganizations?.length ?? 0) > 0) return;
    let cancelled = false;
    fetch("/api/platform/context")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { platformAdminOrganizations?: OrgOption[] } | null) => {
        if (cancelled || !data?.platformAdminOrganizations) return;
        setAdminOrgs(data.platformAdminOrganizations);
      })
      .catch(() => {
        /* ignore — membership list still works */
      });
    return () => {
      cancelled = true;
    };
  }, [props.canUsePlatformAdminMode, props.platformAdminOrganizations]);

  const membershipIds = new Set(props.organizations.map((o) => o.id));
  const adminOnly = adminOrgs.filter((o) => !membershipIds.has(o.id));
  const allOptions = [...props.organizations, ...adminOnly];

  async function switchContext(organizationId: string, branchId: string | null) {
    setError(null);
    const res = await fetch("/api/platform/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, branchId }),
    });
    if (!res.ok) {
      setError(TH.access.forbidden);
      return;
    }
    router.refresh();
  }

  return (
    <div className="context-switcher flex w-full flex-wrap items-center gap-2 text-[length:var(--text-helper)]">
      {props.contextMode === "platform_admin" ? (
        <span className="rounded-[var(--radius-md)] border border-[var(--page-header-border)] bg-[var(--page-header-background)] px-2 py-1 text-[length:var(--text-caption)] font-medium text-[var(--primary)]">
          โหมดผู้ดูแลแพลตฟอร์ม
        </span>
      ) : null}
      <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 xl:flex-none">
        <span className="sr-only sm:not-sr-only sm:shrink-0 sm:text-[var(--text-muted)]">
          {TH.nav.switchOrganization}
        </span>
        <select
          className="select !min-h-10 min-w-0 flex-1 sm:!w-auto sm:max-w-[14rem] sm:flex-none"
          aria-label={TH.nav.switchOrganization}
          disabled={pending || allOptions.length === 0}
          value={props.activeOrganizationId ?? ""}
          onChange={(e) => {
            const orgId = e.target.value;
            start(() => switchContext(orgId, null));
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
        </select>
      </label>
      {props.branches.length > 0 ? (
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 xl:flex-none">
          <span className="sr-only sm:not-sr-only sm:shrink-0 sm:text-[var(--text-muted)]">
            {TH.nav.switchBranch}
          </span>
          <select
            className="select !min-h-10 min-w-0 flex-1 sm:!w-auto sm:max-w-[10rem] sm:flex-none"
            aria-label={TH.nav.switchBranch}
            disabled={pending || !props.activeOrganizationId}
            value={props.activeBranchId ?? ""}
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
