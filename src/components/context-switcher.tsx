"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { TH } from "@/lib/i18n/th";

type OrgOption = { id: string; name: string };
type BranchOption = { id: string; name: string; code: string };

export function ContextSwitcher(props: {
  organizations: OrgOption[];
  branches: BranchOption[];
  activeOrganizationId: string | null;
  activeBranchId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-slate-600">{TH.nav.switchOrganization}</span>
        <select
          className="rounded-lg border border-[var(--border)] bg-white px-2 py-1"
          disabled={pending || props.organizations.length === 0}
          value={props.activeOrganizationId ?? ""}
          onChange={(e) => {
            const orgId = e.target.value;
            start(() => switchContext(orgId, null));
          }}
        >
          {props.organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </label>
      {props.branches.length > 0 ? (
        <label className="flex items-center gap-2">
          <span className="text-slate-600">{TH.nav.switchBranch}</span>
          <select
            className="rounded-lg border border-[var(--border)] bg-white px-2 py-1"
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
      {error ? <span className="text-red-700">{error}</span> : null}
    </div>
  );
}
