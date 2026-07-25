import Link from "next/link";
import type { ReactNode } from "react";

import { ContextSwitcher } from "@/components/context-switcher";
import { LogoutButton } from "@/components/logout-button";
import { ToastHost } from "@/components/ui/toast";
import { filterNavForRoles } from "@/lib/auth/access";
import { TH } from "@/lib/i18n/th";

export function PlatformShell(props: {
  children: ReactNode;
  displayName: string;
  platformRoles: string[];
  organizationRoles: string[];
  organizations: Array<{ id: string; name: string }>;
  branches: Array<{ id: string; name: string; code: string }>;
  activeOrganization: { id: string; name: string } | null;
  activeBranch: { id: string; name: string; code: string } | null;
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
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6">
      <ToastHost />
      <header className="mb-6 rounded-2xl border border-[var(--border)] bg-white/90 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-[var(--accent)]">
              {TH.brand}
            </p>
            <h1 className="text-xl font-bold">{TH.appName}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {TH.common.currentOrganization}:{" "}
              <strong>
                {props.activeOrganization?.name ?? TH.common.notFound}
              </strong>
              {" · "}
              {TH.common.currentBranch}:{" "}
              <strong>
                {props.activeBranch?.name ?? TH.common.noBranch}
              </strong>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="text-sm">
              {TH.common.user}: <strong>{props.displayName}</strong>
            </p>
            <LogoutButton className="btn !bg-slate-700" />
          </div>
        </div>
        <div className="mt-4">
          <ContextSwitcher
            organizations={props.organizations}
            branches={props.branches}
            activeOrganizationId={props.activeOrganization?.id ?? null}
            activeBranchId={props.activeBranch?.id ?? null}
          />
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 md:flex-row">
        <aside className="w-full shrink-0 md:w-56">
          <nav className="card flex flex-row flex-wrap gap-2 md:flex-col">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--background)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{props.children}</main>
      </div>
    </div>
  );
}
