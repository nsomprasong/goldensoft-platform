"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";

import { ContextSwitcher } from "@/components/context-switcher";
import { LogoutButton } from "@/components/logout-button";
import { NavIcon, navIconKeyForHref } from "@/components/ui/icons";
import { ToastHost } from "@/components/ui/toast";
import { isNavigationItemActive } from "@/lib/navigation/active";
import { TH, labelRole } from "@/lib/i18n/th";

export type ShellNavItem = {
  href: string;
  label: string;
  group: "overview" | "organization" | "services" | "system";
};

const GROUP_LABEL: Record<ShellNavItem["group"], string> = {
  overview: "ภาพรวม",
  organization: "การจัดการองค์กร",
  services: "การให้บริการ",
  system: "ระบบและความปลอดภัย",
};

function groupForHref(href: string): ShellNavItem["group"] {
  if (href === "/") return "overview";
  if (
    href.startsWith("/organizations") ||
    href.startsWith("/branches") ||
    href.startsWith("/users") ||
    href.startsWith("/roles")
  ) {
    return "organization";
  }
  if (
    href.startsWith("/products") ||
    href.startsWith("/plans") ||
    href.startsWith("/subscriptions")
  ) {
    return "services";
  }
  return "system";
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      {open ? (
        <path
          d="M5 5l10 10M15 5L5 15"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M3.5 6h13M3.5 10h13M3.5 14h13"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function NavGroups(props: {
  items: ShellNavItem[];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const groups = (["overview", "organization", "services", "system"] as const)
    .map((group) => ({
      group,
      items: props.items.filter((item) => item.group === group),
    }))
    .filter((entry) => entry.items.length > 0);

  return (
    <div className="space-y-5">
      {groups.map((entry) => (
        <div key={entry.group}>
          {!props.collapsed ? (
            <p className="mb-2 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              {GROUP_LABEL[entry.group]}
            </p>
          ) : null}
          <ul className="space-y-1">
            {entry.items.map((item) => {
              const active = isNavigationItemActive(props.pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={props.collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    onClick={props.onNavigate}
                    className={[
                      "relative flex min-h-11 items-center rounded-[var(--radius-md)] px-3 text-[length:var(--text-label)] transition",
                      active
                        ? "bg-[var(--sidebar-active-background)] font-semibold text-[var(--primary)]"
                        : "font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]",
                      props.collapsed ? "justify-center" : "gap-2.5",
                    ].join(" ")}
                  >
                    {active ? (
                      <span
                        className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-[var(--sidebar-active-accent)]"
                        aria-hidden="true"
                      />
                    ) : null}
                    <span
                      className={[
                        "inline-flex shrink-0",
                        active ? "text-[var(--primary)]" : "text-[var(--text-muted)]",
                      ].join(" ")}
                    >
                      <NavIcon name={navIconKeyForHref(item.href)} size={18} />
                    </span>
                    {!props.collapsed ? (
                      <span className="truncate">{item.label}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AppShell(props: {
  children: ReactNode;
  displayName: string;
  roles: string[];
  navItems: Array<{ href: string; label: string }>;
  organizations: Array<{ id: string; name: string }>;
  platformAdminOrganizations?: Array<{ id: string; name: string }>;
  branches: Array<{ id: string; name: string; code: string }>;
  activeOrganization: { id: string; name: string } | null;
  activeBranch: { id: string; name: string; code: string } | null;
  contextMode?: "membership" | "platform_admin";
  canUsePlatformAdminMode?: boolean;
  pageTitle?: string;
}) {
  const pathname = usePathname() ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const drawerId = useId();

  const nav: ShellNavItem[] = props.navItems.map((item) => ({
    ...item,
    group: groupForHref(item.href),
  }));

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const roleLabels = props.roles.map((code) => labelRole(code)).filter(Boolean);
  const sidebarWidth = collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-width)";

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      <ToastHost />

      <div className="flex min-h-screen">
        <aside
          className="desktop-sidebar sticky top-0 h-screen shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]"
          style={{ width: sidebarWidth }}
        >
          <div className="flex h-[var(--header-height)] items-center justify-between gap-2 border-b border-[var(--border)] px-3">
            <Link href="/" className="brand-mark min-w-0">
              <span className="brand-mark-badge">GS</span>
              {!collapsed ? (
                <span className="truncate text-sm">
                  {TH.brand}
                  <span className="mt-0.5 block text-[0.7rem] font-medium text-[var(--text-muted)]">
                    {TH.shellName}
                  </span>
                </span>
              ) : null}
            </Link>
            <button
              type="button"
              className="btn btn-ghost !min-h-10 !px-2"
              aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
              onClick={() => setCollapsed((value) => !value)}
            >
              <span aria-hidden="true">{collapsed ? "»" : "«"}</span>
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto p-3" aria-label="เมนูหลัก">
            <NavGroups items={nav} pathname={pathname} collapsed={collapsed} />
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="app-top-header sticky top-0 z-30 border-b border-[var(--border)]">
            <div className="shell-header-inner mx-auto max-w-[var(--container-max)]">
              <div className="flex min-h-[var(--header-height)] items-center gap-2 py-2 sm:gap-3">
                <button
                  type="button"
                  className="navigation-trigger btn btn-ghost !min-h-11 shrink-0 !px-2.5"
                  aria-expanded={mobileOpen}
                  aria-controls={drawerId}
                  aria-label="เปิดเมนู"
                  onClick={() => setMobileOpen(true)}
                >
                  <MenuIcon open={false} />
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[length:var(--text-label)] font-semibold"
                    title={
                      props.pageTitle ??
                      props.activeOrganization?.name ??
                      TH.shellName
                    }
                  >
                    {props.pageTitle ?? props.activeOrganization?.name ?? TH.shellName}
                  </p>
                  <p className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {props.activeOrganization?.name ?? TH.common.notFound}
                    {" · "}
                    {props.activeBranch?.name ?? TH.common.noBranch}
                  </p>
                </div>

                <div className="desktop-context min-w-0 items-center">
                  <ContextSwitcher
                    organizations={props.organizations}
                    platformAdminOrganizations={props.platformAdminOrganizations}
                    branches={props.branches}
                    activeOrganizationId={props.activeOrganization?.id ?? null}
                    activeBranchId={props.activeBranch?.id ?? null}
                    contextMode={props.contextMode}
                    canUsePlatformAdminMode={props.canUsePlatformAdminMode}
                  />
                </div>

                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                  <div className="hidden max-w-[10rem] text-right sm:block lg:max-w-[14rem]">
                    <p
                      className="truncate text-[length:var(--text-label)] font-medium"
                      title={props.displayName}
                    >
                      {props.displayName}
                    </p>
                    <p
                      className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]"
                      title={roleLabels.join(" · ") || TH.common.user}
                    >
                      {roleLabels.slice(0, 2).join(" · ") || TH.common.user}
                    </p>
                  </div>
                  <LogoutButton className="btn btn-secondary !min-h-10 shrink-0" />
                </div>
              </div>

              <div className="tablet-context border-t border-[var(--border)] py-2">
                <ContextSwitcher
                  organizations={props.organizations}
                  platformAdminOrganizations={props.platformAdminOrganizations}
                  branches={props.branches}
                  activeOrganizationId={props.activeOrganization?.id ?? null}
                  activeBranchId={props.activeBranch?.id ?? null}
                  contextMode={props.contextMode}
                  canUsePlatformAdminMode={props.canUsePlatformAdminMode}
                />
              </div>
            </div>
          </header>

          <main className="page-container flex-1">
            {props.children}
          </main>
        </div>
      </div>

      {mobileOpen ? (
        <div className="mobile-navigation fixed inset-0 z-40" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="ปิดเมนู"
            onClick={() => setMobileOpen(false)}
          />
          <div
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label="เมนูนำทาง"
            className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-[var(--surface)] shadow-[var(--shadow-md)]"
          >
            <div className="flex h-[var(--header-height)] items-center justify-between border-b border-[var(--border)] px-4">
              <Link href="/" className="brand-mark" onClick={() => setMobileOpen(false)}>
                <span className="brand-mark-badge">GS</span>
                <span>
                  {TH.brand}
                  <span className="mt-0.5 block text-[0.7rem] font-medium text-[var(--text-muted)]">
                    {TH.shellName}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                className="btn btn-ghost !min-h-11 !px-2.5"
                aria-label="ปิดเมนู"
                onClick={() => setMobileOpen(false)}
              >
                <MenuIcon open />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">
              <NavGroups
                items={nav}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </nav>
            <div className="border-t border-[var(--border)] p-4 text-[length:var(--text-helper)]">
              <p className="font-medium">{props.displayName}</p>
              <p className="text-[var(--text-muted)]">
                {roleLabels.slice(0, 2).join(" · ") || TH.common.user}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
