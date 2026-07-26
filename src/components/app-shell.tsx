"use client";

import Link from "next/link";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";

import { ContextSwitcher } from "@/components/context-switcher";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { NavIcon, navIconKeyForHref } from "@/components/ui/icons";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ToastHost } from "@/components/ui/toast";
import { isNavigationItemActive } from "@/lib/navigation/active";
import { TH, labelRole } from "@/lib/i18n/th";
import { signalNavigationDone } from "@/lib/navigation-pending";
import {
  loadManagedOrganizations,
  loadPlatformAdminOrganizations,
} from "@/lib/platform/admin-organizations-client";

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

/** Static tone classes — never interpolate Tailwind color tokens. */
const GROUP_TONE: Record<
  ShellNavItem["group"],
  {
    label: string;
    iconIdle: string;
    iconActive: string;
    rowActive: string;
    accent: string;
  }
> = {
  overview: {
    label: "text-[var(--primary)]",
    iconIdle:
      "bg-[var(--primary-soft)] text-[var(--primary)] ring-1 ring-[var(--page-header-border)]",
    iconActive:
      "bg-gradient-to-br from-[#d97706] to-[#b45309] text-white shadow-[0_6px_14px_rgba(180,83,9,0.28)]",
    rowActive:
      "bg-gradient-to-r from-[var(--primary-soft)] via-[#fff7ed] to-transparent font-semibold text-[var(--primary)] shadow-[inset_0_0_0_1px_rgba(180,83,9,0.14)]",
    accent: "bg-[var(--primary)] shadow-[0_0_12px_rgba(180,83,9,0.45)]",
  },
  organization: {
    label: "text-[var(--dashboard-blue)]",
    iconIdle:
      "bg-[var(--dashboard-blue-soft)] text-[var(--dashboard-blue)] ring-1 ring-[var(--info-border)]",
    iconActive:
      "bg-gradient-to-br from-[#3b82f6] to-[#2563eb] text-white shadow-[0_6px_14px_rgba(37,99,235,0.28)]",
    rowActive:
      "bg-gradient-to-r from-[var(--dashboard-blue-soft)] via-[#eff6ff] to-transparent font-semibold text-[var(--dashboard-blue)] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.14)]",
    accent: "bg-[var(--dashboard-blue)] shadow-[0_0_12px_rgba(37,99,235,0.4)]",
  },
  services: {
    label: "text-[var(--dashboard-green)]",
    iconIdle:
      "bg-[var(--dashboard-green-soft)] text-[var(--dashboard-green)] ring-1 ring-[var(--success-border)]",
    iconActive:
      "bg-gradient-to-br from-[#10b981] to-[#059669] text-white shadow-[0_6px_14px_rgba(5,150,105,0.28)]",
    rowActive:
      "bg-gradient-to-r from-[var(--dashboard-green-soft)] via-[#ecfdf5] to-transparent font-semibold text-[var(--dashboard-green)] shadow-[inset_0_0_0_1px_rgba(5,150,105,0.14)]",
    accent: "bg-[var(--dashboard-green)] shadow-[0_0_12px_rgba(5,150,105,0.4)]",
  },
  system: {
    label: "text-[var(--dashboard-amber)]",
    iconIdle:
      "bg-[var(--dashboard-amber-soft)] text-[var(--dashboard-amber)] ring-1 ring-[var(--warning-border)]",
    iconActive:
      "bg-gradient-to-br from-[#f59e0b] to-[#d97706] text-white shadow-[0_6px_14px_rgba(217,119,6,0.28)]",
    rowActive:
      "bg-gradient-to-r from-[var(--dashboard-amber-soft)] via-[#fffbeb] to-transparent font-semibold text-[var(--dashboard-amber)] shadow-[inset_0_0_0_1px_rgba(217,119,6,0.16)]",
    accent: "bg-[var(--dashboard-amber)] shadow-[0_0_12px_rgba(217,119,6,0.4)]",
  },
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
    href.startsWith("/subscriptions") ||
    href.startsWith("/billing")
  ) {
    return "services";
  }
  return "system";
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
      {groups.map((entry) => {
        const tone = GROUP_TONE[entry.group];
        return (
          <div key={entry.group}>
            {!props.collapsed ? (
              <p
                className={[
                  "mb-2 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.08em]",
                  tone.label,
                ].join(" ")}
              >
                {GROUP_LABEL[entry.group]}
              </p>
            ) : null}
            <ul className="space-y-1.5">
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
                        "shell-nav-link relative flex min-h-12 items-center rounded-[0.9rem] px-2.5 text-[length:var(--text-label)] transition-[background-color,color,box-shadow,transform] duration-200",
                        active
                          ? tone.rowActive
                          : "font-medium text-[var(--text-secondary)] hover:-translate-y-px hover:bg-white hover:text-[var(--text-primary)] hover:shadow-[var(--shadow-sm)]",
                        props.collapsed ? "justify-center" : "gap-2.5",
                      ].join(" ")}
                    >
                      {active ? (
                        <span
                          className={[
                            "absolute inset-y-2 left-0 w-1 rounded-full",
                            tone.accent,
                          ].join(" ")}
                          aria-hidden="true"
                        />
                      ) : null}
                      <span
                        className={[
                          "inline-flex size-8 shrink-0 items-center justify-center rounded-[0.7rem]",
                          active ? tone.iconActive : tone.iconIdle,
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
        );
      })}
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
  managedOrganizations?: Array<{ id: string; name: string }>;
  branches: Array<{ id: string; name: string; code: string }>;
  activeOrganization: { id: string; name: string } | null;
  activeBranch: { id: string; name: string; code: string } | null;
  contextMode?: "membership" | "platform_admin" | "managed_org";
  canUsePlatformAdminMode?: boolean;
  canUseManagedOrgMode?: boolean;
  pageTitle?: string;
}) {
  const pathname = usePathname() ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [adminOrganizations, setAdminOrganizations] = useState(
    props.platformAdminOrganizations ?? [],
  );
  const [managedOrganizations, setManagedOrganizations] = useState(
    props.managedOrganizations ?? [],
  );
  const drawerId = useId();

  const nav: ShellNavItem[] = props.navItems.map((item) => ({
    ...item,
    group: groupForHref(item.href),
  }));

  useEffect(() => {
    setMobileOpen(false);
    signalNavigationDone();
  }, [pathname, props.activeOrganization?.id, props.activeBranch?.id]);

  useEffect(() => {
    if (!props.canUsePlatformAdminMode) return;
    if ((props.platformAdminOrganizations?.length ?? 0) > 0) {
      setAdminOrganizations(props.platformAdminOrganizations ?? []);
      return;
    }
    let cancelled = false;
    void loadPlatformAdminOrganizations().then((rows) => {
      if (!cancelled) setAdminOrganizations(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [props.canUsePlatformAdminMode, props.platformAdminOrganizations]);

  useEffect(() => {
    if (!props.canUseManagedOrgMode) return;
    if ((props.managedOrganizations?.length ?? 0) > 0) {
      setManagedOrganizations(props.managedOrganizations ?? []);
      return;
    }
    let cancelled = false;
    void loadManagedOrganizations().then((rows) => {
      if (!cancelled) setManagedOrganizations(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [props.canUseManagedOrgMode, props.managedOrganizations]);

  const roleLabels = props.roles.map((code) => labelRole(code)).filter(Boolean);
  const sidebarWidth = collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-width)";
  const initials = props.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <div className="app-shell-root min-h-screen text-[var(--text-primary)]">
      <ToastHost />

      <div className="flex min-h-screen">
        <aside
          className="desktop-sidebar sticky top-0 h-screen shrink-0 flex-col border-r border-[var(--page-header-border)]"
          style={{ width: sidebarWidth }}
        >
          <div className="flex h-[var(--header-height)] items-center justify-between gap-2 border-b border-[var(--page-header-border)] px-3">
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="!min-h-10 shrink-0 !px-2"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
              title={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <nav className="flex-1 overflow-y-auto p-3" aria-label="เมนูหลัก">
            <NavGroups items={nav} pathname={pathname} collapsed={collapsed} />
          </nav>
          {!collapsed ? (
            <div className="border-t border-[var(--page-header-border)] p-3">
              <div className="rounded-[var(--radius-lg)] border border-[var(--page-header-border)] bg-[var(--primary-soft)]/70 px-3 py-2.5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--primary)]">
                  GoldenSoft
                </p>
                <p className="mt-0.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  ศูนย์ควบคุมแพลตฟอร์ม
                </p>
              </div>
            </div>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="app-top-header sticky top-0 z-30 border-b border-[var(--page-header-border)]">
            <div className="shell-header-inner mx-auto max-w-[var(--container-max)]">
              <div className="shell-header-bar flex min-h-[var(--header-height)] items-center gap-2 py-2 sm:gap-3">
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="navigation-trigger shell-menu-trigger size-10 !min-h-11 shrink-0 rounded-[0.85rem] !px-2.5"
                    aria-expanded={mobileOpen}
                    aria-controls={drawerId}
                    aria-label="เปิดเมนู"
                    title="เปิดเมนู"
                  >
                    <Menu className="size-5" aria-hidden="true" />
                  </Button>
                </SheetTrigger>

                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[length:var(--text-label)] font-semibold text-[var(--text-primary)]"
                    title={
                      props.pageTitle ??
                      props.activeOrganization?.name ??
                      TH.shellName
                    }
                  >
                    {props.pageTitle ?? props.activeOrganization?.name ?? TH.shellName}
                  </p>
                  <p className="truncate text-[length:var(--text-caption)] text-[var(--primary)]">
                    {props.activeOrganization?.name ?? TH.common.notFound}
                    {" · "}
                    {props.activeBranch?.name ?? TH.common.noBranch}
                  </p>
                </div>

                <div className="desktop-context min-w-0 items-center">
                  <ContextSwitcher
                    organizations={props.organizations}
                    platformAdminOrganizations={adminOrganizations}
                    managedOrganizations={managedOrganizations}
                    branches={props.branches}
                    activeOrganizationId={props.activeOrganization?.id ?? null}
                    activeBranchId={props.activeBranch?.id ?? null}
                    contextMode={props.contextMode}
                    canUsePlatformAdminMode={props.canUsePlatformAdminMode}
                  />
                </div>

                <div className="shell-user-chip flex shrink-0 items-center gap-1.5 rounded-[0.9rem] border border-[var(--page-header-border)] bg-white/80 p-1 pl-1.5 shadow-[var(--shadow-xs)] sm:gap-2 sm:pl-2">
                  <div
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#d97706] to-[#92400e] text-[0.65rem] font-bold text-white shadow-[0_4px_10px_rgba(180,83,9,0.28)] sm:size-9 sm:text-[0.7rem]"
                    aria-hidden="true"
                  >
                    {initials || "GS"}
                  </div>
                  <div className="hidden min-w-0 max-w-[10rem] text-left sm:block lg:max-w-[14rem]">
                    <p
                      className="truncate text-[length:var(--text-label)] font-semibold"
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
                  <LogoutButton className="shell-logout-trigger shrink-0" />
                </div>
              </div>

              <div className="tablet-context border-t border-[var(--page-header-border)] py-2">
                <ContextSwitcher
                  organizations={props.organizations}
                  platformAdminOrganizations={adminOrganizations}
                  managedOrganizations={managedOrganizations}
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

        <SheetContent
          id={drawerId}
          side="left"
          className="mobile-navigation border-[var(--page-header-border)] bg-transparent"
          aria-describedby={undefined}
        >
            <div className="mobile-navigation-header flex h-[var(--header-height)] items-center border-b px-4 pr-14">
              <Link href="/" className="brand-mark" onClick={() => setMobileOpen(false)}>
                <span className="brand-mark-badge">GS</span>
                <span>
                  {TH.brand}
                  <span className="mt-0.5 block text-[0.7rem] font-medium text-[var(--text-muted)]">
                    {TH.shellName}
                  </span>
                </span>
              </Link>
            </div>
            <SheetTitle className="sr-only">เมนูนำทาง</SheetTitle>
            <nav className="flex-1 overflow-y-auto p-3" aria-label="เมนูหลักบนมือถือ">
              <NavGroups
                items={nav}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </nav>
            <div className="mobile-navigation-footer border-t p-4 text-[length:var(--text-helper)]">
              <div className="flex items-center gap-3 rounded-[0.9rem] border border-[var(--page-header-border)] bg-white/80 px-3 py-2.5 shadow-[var(--shadow-xs)]">
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#d97706] to-[#92400e] text-[0.75rem] font-bold text-white shadow-[0_4px_12px_rgba(180,83,9,0.28)]"
                  aria-hidden="true"
                >
                  {initials || "GS"}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--text-primary)]">
                    {props.displayName}
                  </p>
                  <p className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {roleLabels.slice(0, 2).join(" · ") || TH.common.user}
                  </p>
                </div>
              </div>
            </div>
        </SheetContent>
      </div>
    </Sheet>
  );
}
