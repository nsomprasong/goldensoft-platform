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
import { cn } from "@/lib/utils";
import {
  loadManagedOrganizations,
  loadPlatformAdminOrganizations,
} from "@/lib/platform/admin-organizations-client";
import styles from "./app-shell.module.css";

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

/** HR / Customer App nav tone classes — never interpolate color tokens. */
const NAV_TONE_CLASS: Record<
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
    label: "nav-tone-overview",
    iconIdle: "nav-icon-idle-overview",
    iconActive: "nav-icon-active-overview",
    rowActive: "nav-row-active-overview",
    accent: "nav-accent-overview",
  },
  organization: {
    label: "nav-tone-organization",
    iconIdle: "nav-icon-idle-organization",
    iconActive: "nav-icon-active-organization",
    rowActive: "nav-row-active-organization",
    accent: "nav-accent-organization",
  },
  services: {
    label: "nav-tone-services",
    iconIdle: "nav-icon-idle-services",
    iconActive: "nav-icon-active-services",
    rowActive: "nav-row-active-services",
    accent: "nav-accent-services",
  },
  system: {
    label: "nav-tone-system",
    iconIdle: "nav-icon-idle-system",
    iconActive: "nav-icon-active-system",
    rowActive: "nav-row-active-system",
    accent: "nav-accent-system",
  },
};

function isExternalHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

function groupForHref(href: string): ShellNavItem["group"] {
  if (isExternalHref(href)) return "services";
  if (href === "/") return "overview";
  if (
    href.startsWith("/organizations") ||
    href.startsWith("/branches") ||
    href.startsWith("/users") ||
    href === "/staff" ||
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
    <div className={props.collapsed ? "platform-nav is-collapsed" : "platform-nav"}>
      {groups.map((entry) => {
        const tone = NAV_TONE_CLASS[entry.group];
        return (
          <section
            key={entry.group}
            className={`nav-group nav-group--${entry.group}`}
            data-tone={entry.group}
          >
            {!props.collapsed ? (
              <div className="nav-group-head">
                <div className={`nav-group-title ${tone.label}`}>
                  {GROUP_LABEL[entry.group]}
                </div>
              </div>
            ) : null}
            <div className="nav-group-body">
              <div className={`nav-section nav-section--${entry.group}`}>
                {entry.items.map((item) => {
                  const external = isExternalHref(item.href);
                  const active = external
                    ? false
                    : isNavigationItemActive(props.pathname, item);
                  const className = [
                    "shell-nav-link",
                    active ? `active ${tone.rowActive}` : "",
                    props.collapsed ? "is-collapsed" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const content = (
                    <>
                      {active ? (
                        <span
                          className={`shell-nav-accent ${tone.accent}`}
                          aria-hidden="true"
                        />
                      ) : null}
                      <span
                        className={[
                          "shell-nav-icon",
                          active ? tone.iconActive : tone.iconIdle,
                        ].join(" ")}
                      >
                        <NavIcon
                          name={navIconKeyForHref(
                            external ? "/products" : item.href,
                          )}
                          size={18}
                        />
                      </span>
                      {!props.collapsed ? (
                        <span className="shell-nav-label">{item.label}</span>
                      ) : null}
                    </>
                  );
                  return external ? (
                    <a
                      key={item.href}
                      href={item.href}
                      title={props.collapsed ? item.label : undefined}
                      onClick={props.onNavigate}
                      className={className}
                    >
                      {content}
                    </a>
                  ) : (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={props.collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      onClick={props.onNavigate}
                      className={className}
                    >
                      {content}
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
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
  branches: Array<{ id: string; name: string; code: string }>;
  activeOrganization: {
    id: string;
    name: string;
    customerCode?: string | null;
  } | null;
  activeBranch: { id: string; name: string; code: string } | null;
  contextMode?: "membership" | "platform_admin" | "managed_org";
  shellMode?: "platform" | "customer_support";
  /** Absolute Customer App handoff URL when supporting a customer org. */
  customerAppHref?: string | null;
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
                  {props.shellMode === "customer_support"
                    ? TH.nav.customerSupportBadge
                    : "ศูนย์ควบคุมแพลตฟอร์ม"}
                </p>
              </div>
            </div>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="app-top-header sticky top-0 z-30 border-b border-[var(--page-header-border)]">
            <div className="shell-header-inner mx-auto grid max-w-[var(--container-max)] grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-x-1.5 gap-y-2 py-2 [grid-template-areas:'brand_brand_user'_'menu_context_context'] md:block md:py-0">
              <div className="shell-header-bar contents md:flex md:min-h-[var(--header-height)] md:items-center md:gap-3 md:py-2">
                <Link
                  href="/"
                  className="brand-mark min-w-0 [grid-area:brand] md:hidden"
                >
                  <span className="brand-mark-badge">GS</span>
                  <span className="truncate text-sm">{TH.brand}</span>
                </Link>

                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="navigation-trigger shell-menu-trigger size-10 !min-h-11 shrink-0 rounded-[0.85rem] !px-2.5 [grid-area:menu]"
                    aria-expanded={mobileOpen}
                    aria-controls={drawerId}
                    aria-label="เปิดเมนู"
                    title="เปิดเมนู"
                  >
                    <Menu className="size-5" aria-hidden="true" />
                  </Button>
                </SheetTrigger>

                <div className="desktop-context min-w-0 items-center">
                  <ContextSwitcher
                    organizations={props.organizations}
                    platformAdminOrganizations={adminOrganizations}
                    managedOrganizations={managedOrganizations}
                    branches={props.branches}
                    activeOrganizationId={props.activeOrganization?.id ?? null}
                    activeBranchId={props.activeBranch?.id ?? null}
                    contextMode={props.contextMode}
                    shellMode={props.shellMode}
                    customerAppHref={props.customerAppHref}
                    canUsePlatformAdminMode={props.canUsePlatformAdminMode}
                  />
                </div>

                <div className="shell-user-chip ml-auto flex min-w-0 max-w-full flex-1 items-center justify-between gap-2 overflow-hidden rounded-[0.9rem] border border-[var(--page-header-border)] bg-white/80 p-1 pl-2 shadow-[var(--shadow-xs)] [grid-area:user] sm:flex-none sm:justify-start sm:gap-2">
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--gs-amber-accent)] to-[var(--primary-hover)] text-[0.65rem] font-bold text-white shadow-[var(--shadow-glow)] sm:size-9 sm:text-[0.7rem]"
                    aria-hidden="true"
                  >
                    {initials || "GS"}
                  </div>
                  <div className="min-w-0 flex-1 text-left sm:flex-none sm:max-w-[10rem] lg:max-w-[14rem]">
                    <p
                      className="truncate text-[length:var(--text-label)] font-semibold leading-tight"
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
              <div className="mobile-context min-w-0 border-0 py-0 [grid-area:context] [&_.context-chip]:!min-w-0 [&_.context-chip]:!max-w-none [&_.context-chip]:!flex-1 [&_.context-chip-label]:hidden [&_.context-switcher]:!flex-row [&_.context-switcher]:!flex-nowrap md:border-t md:border-[var(--page-header-border)] md:py-2 md:[&_.context-chip-label]:inline">
                <ContextSwitcher
                  organizations={props.organizations}
                  platformAdminOrganizations={adminOrganizations}
                  managedOrganizations={managedOrganizations}
                  branches={props.branches}
                  activeOrganizationId={props.activeOrganization?.id ?? null}
                  activeBranchId={props.activeBranch?.id ?? null}
                  contextMode={props.contextMode}
                  shellMode={props.shellMode}
                  customerAppHref={props.customerAppHref}
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
          overlayClassName={cn(styles.mobileOverlay, "!top-[7.75rem] md:!top-0")}
          className={cn(
            styles.mobileDrawer,
            "mobile-navigation !top-[7.75rem] !h-auto border-[var(--page-header-border)] bg-transparent md:!top-0 md:!h-full",
          )}
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
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--gs-amber-accent)] to-[var(--primary-hover)] text-[0.75rem] font-bold text-white shadow-[var(--shadow-glow)]"
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
