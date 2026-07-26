import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STATUS_CODES_WITH_TONES,
  statusToneForCode,
} from "../src/components/ui/admin-ui";
import { PLATFORM_NAV, filterNavForRoles } from "../src/lib/auth/access";
import { TH, labelInvitationStatus, labelStatus } from "../src/lib/i18n/th";

const ROOT = path.resolve(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Phase 6 design tokens", () => {
  it("defines required semantic color tokens in globals.css", () => {
    const css = read("src/app/globals.css");
    for (const token of [
      "--background",
      "--surface",
      "--surface-muted",
      "--surface-elevated",
      "--border",
      "--border-strong",
      "--text-primary",
      "--text-secondary",
      "--text-muted",
      "--primary",
      "--primary-hover",
      "--primary-soft",
      "--success",
      "--warning",
      "--danger",
      "--info",
      "--focus-ring",
      "--sidebar-width",
      "--header-height",
      "--control-height",
      "--dashboard-blue-soft",
      "--dashboard-green-soft",
      "--dashboard-violet-soft",
      "--dashboard-amber-soft",
      "--dashboard-orange-soft",
      "--page-header-background",
      "--page-header-border",
      "--sidebar-active-background",
      "--sidebar-active-accent",
    ]) {
      assert.match(css, new RegExp(`${token}:`));
    }
  });

  it("maps required invitation and lifecycle statuses", () => {
    for (const code of [
      "ACTIVE",
      "INACTIVE",
      "SUSPENDED",
      "PENDING",
      "TRIAL",
      "EXPIRED",
      "CANCELLED",
      "AUTH_SENT",
      "COMPLETED",
      "FAILED",
      "PLATFORM_SETUP_FAILED",
    ]) {
      assert.ok(STATUS_CODES_WITH_TONES.includes(code), `missing tone for ${code}`);
      assert.notEqual(statusToneForCode(code), undefined);
      assert.ok(labelStatus(code) || labelInvitationStatus(code));
    }
    assert.equal(labelInvitationStatus("AUTH_SENT"), "ส่งคำเชิญแล้ว");
    assert.equal(labelInvitationStatus("PLATFORM_SETUP_FAILED"), "จัดเตรียมสิทธิ์ไม่สำเร็จ");
    assert.equal(labelStatus("ACTIVE"), "ใช้งาน");
  });

  it("defines Safari-safe sRGB fallbacks for critical colors", () => {
    const css = read("src/app/globals.css");
    for (const declaration of [
      "--color-background: #f6f7f9",
      "--color-surface: #ffffff",
      "--color-surface-muted: #f8fafc",
      "--color-border: #dbe2ea",
      "--color-text-primary: #172033",
      "--color-text-secondary: #526174",
      "--color-primary: #b45309",
      "--color-primary-hover: #92400e",
      "--color-primary-soft: #fff7ed",
      "--color-blue-soft: #eff6ff",
      "--color-green-soft: #ecfdf5",
      "--color-violet-soft: #f5f3ff",
      "--color-amber-soft: #fffbeb",
      "--color-orange-soft: #fff7ed",
    ]) {
      assert.ok(css.includes(declaration), `missing ${declaration}`);
    }
    assert.match(css, /--page-header-background:\s*#fffaf3/);
    assert.doesNotMatch(css, /color-mix\(/);
  });

  it("does not rely on color-mix for critical styling", () => {
    const css = read("src/app/globals.css");
    const dashboard = read("src/app/page.tsx");
    const adminUi = read("src/components/ui/admin-ui.tsx");
    assert.doesNotMatch(css, /color-mix\(/);
    assert.doesNotMatch(dashboard, /color-mix\(/);
    assert.doesNotMatch(adminUi, /color-mix\(/);
    assert.match(dashboard, /dashboard-hero-surface/);
    assert.match(adminUi, /page-header/);
  });

  it("does not construct Tailwind color classes dynamically", () => {
    const files = [
      "src/app/page.tsx",
      "src/components/app-shell.tsx",
      "src/components/ui/admin-ui.tsx",
      "src/components/ui/icons.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(
        source,
        /(?:bg|text|border)-\$\{|(?:bg|text|border)-\$\{/,
        file,
      );
    }
  });

  it("provides one responsive page container with iPad padding and safe area", () => {
    const css = read("src/app/globals.css");
    const shell = read("src/components/app-shell.tsx");
    assert.match(css, /\.page-container\s*\{/);
    assert.match(css, /padding:\s*20px 16px 32px/);
    assert.match(css, /@media \(min-width: 768px\)[\s\S]*padding:\s*24px/);
    assert.match(css, /@media \(min-width: 1280px\)[\s\S]*padding:\s*28px 32px 40px/);
    assert.match(css, /env\(safe-area-inset-left\)/);
    assert.match(shell, /<main className="page-container flex-1">/);
  });

  it("uses an intentional two-row tablet header until 1200px", () => {
    const css = read("src/app/globals.css");
    const shell = read("src/components/app-shell.tsx");
    assert.match(shell, /desktop-context/);
    assert.match(shell, /tablet-context/);
    assert.match(shell, /desktop-sidebar/);
    assert.match(shell, /navigation-trigger/);
    assert.match(css, /\.desktop-context\s*\{\s*display:\s*none/);
    assert.match(css, /\.tablet-context\s*\{\s*display:\s*block/);
    assert.match(css, /@media \(min-width: 1200px\)/);
    assert.doesNotMatch(shell, /lg:flex|lg:hidden/);
    assert.doesNotMatch(shell, /padding-top|pt-\[/);
  });

  it("keeps safe-area padding on the outer header only", () => {
    const css = read("src/app/globals.css");
    const pageContainer = css.match(
      /\.page-container\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    const shellHeader = css.match(
      /\.shell-header-inner\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    assert.ok(pageContainer);
    assert.ok(shellHeader);
    assert.doesNotMatch(pageContainer, /safe-area-inset/);
    assert.match(shellHeader, /safe-area-inset-left/);
    assert.match(shellHeader, /safe-area-inset-right/);
  });

  it("does not absolutely position the header page title", () => {
    const shell = read("src/components/app-shell.tsx");
    const adminUi = read("src/components/ui/admin-ui.tsx");
    assert.doesNotMatch(shell, /absolute[^"\n]*(?:page-title|brand-mark)/);
    assert.doesNotMatch(adminUi, /absolute[^"\n]*text-page/);
  });

  it("declares a device-width cover viewport", () => {
    const layout = read("src/app/layout.tsx");
    assert.match(layout, /export const viewport/);
    assert.match(layout, /width:\s*"device-width"/);
    assert.match(layout, /initialScale:\s*1/);
    assert.match(layout, /viewportFit:\s*"cover"/);
  });

  it("keeps a single deterministic root html with suppressHydrationWarning", () => {
    const layout = read("src/app/layout.tsx");
    assert.match(layout, /<html lang="th" suppressHydrationWarning>/);
    assert.equal((layout.match(/<html\b/g) ?? []).length, 1);
    assert.doesNotMatch(layout, /typeof window|Date\.now\(|new Date\(|Math\.random\(|localStorage|navigator/);
    assert.doesNotMatch(layout, /"use client"/);
    const adminUi = read("src/components/ui/admin-ui.tsx");
    const dashboard = read("src/app/page.tsx");
    assert.doesNotMatch(adminUi, /suppressHydrationWarning/);
    assert.doesNotMatch(dashboard, /suppressHydrationWarning/);
  });
});

describe("Phase 6 navigation copy", () => {
  it("uses Thai labels for primary nav items", () => {
    assert.equal(TH.nav.home, "ภาพรวม");
    assert.equal(TH.nav.organizations, "องค์กร");
    assert.equal(TH.nav.branches, "สาขา");
    assert.equal(TH.nav.users, "ผู้ใช้งาน");
    assert.equal(TH.nav.roles, "บทบาทและสิทธิ์");
    assert.equal(TH.nav.auditLogs, "บันทึกกิจกรรม");
    assert.equal(TH.shellName, "ศูนย์บริหาร GoldenSoft");
  });

  it("filters nav by permission without changing route contracts", () => {
    const empty = filterNavForRoles({
      platformRoles: [],
      organizationRoles: [],
    });
    assert.ok(empty.every((item) => !item.permission));
    assert.ok(empty.some((item) => item.href === "/"));

    const admin = filterNavForRoles({
      platformRoles: ["SUPER_ADMIN"],
      organizationRoles: [],
    });
    assert.ok(admin.length > 0);
    assert.ok(admin.every((item) => PLATFORM_NAV.some((n) => n.href === item.href)));
  });

  it("app shell groups menus in Thai", () => {
    const shell = read("src/components/app-shell.tsx");
    assert.match(shell, /ภาพรวม/);
    assert.match(shell, /การจัดการองค์กร/);
    assert.match(shell, /drawer|mobile|aria-label/i);
  });
});

describe("Phase 6 shared UI components", () => {
  it("exports central components from admin-ui", () => {
    const source = read("src/components/ui/admin-ui.tsx");
    for (const name of [
      "PageHeader",
      "SectionHeader",
      "StatCard",
      "DataTable",
      "MobileRecordCard",
      "SearchFilterBar",
      "StatusBadge",
      "EmptyState",
      "LoadingState",
      "AccessDenied",
      "ConfirmDialog",
      "FormField",
      "Pagination",
      "DetailList",
      "ActivityList",
    ]) {
      assert.match(source, new RegExp(`export function ${name}`));
    }
    assert.match(source, /from "@\/components\/ui\/badge"/);
    assert.match(source, /from "@\/components\/ui\/labeled-icon-button"/);
    assert.match(source, /from "@\/components\/ui\/table"/);
  });

  it("keeps DataTable desktop-only and MobileRecordCard for narrow screens", () => {
    const source = read("src/components/ui/admin-ui.tsx");
    assert.match(source, /hidden overflow-x-auto[\s\S]*md:block/);
    assert.match(source, /export function MobileRecordCard/);
  });

  it("list pages use mobile record patterns on key admin routes", () => {
    const users = read("src/app/users/page.tsx");
    const orgs = read("src/app/organizations/page.tsx");
    assert.match(users, /MobileRecordCard|md:hidden/);
    assert.match(orgs, /md:hidden/);
    assert.match(users, /StatusBadge/);
    assert.match(orgs, /StatusBadge/);
  });

  it("PageHeader supports elevated surface, icon, and actions layout", () => {
    const source = read("src/components/ui/admin-ui.tsx");
    const css = read("src/app/globals.css");
    assert.match(source, /className="page-header/);
    assert.match(css, /--page-header-background:\s*#fffaf3/);
    assert.match(source, /icon\?: ReactNode/);
    assert.match(source, /status\?: ReactNode/);
    assert.match(source, /secondaryActions\?: ReactNode/);
    assert.match(source, /badge\?: ReactNode/);
    assert.match(source, /page-header-content/);
    assert.match(source, /page-header-actions/);
  });

  it("dashboard uses real permission-gated stats and hierarchy classes", () => {
    const dash = read("src/app/page.tsx");
    assert.match(dash, /dashboard-hero/);
    assert.match(dash, /dashboard-summary/);
    assert.match(dash, /dashboard-stat-grid/);
    assert.match(dash, /dashboard-panels/);
    assert.match(dash, /organizationCount/);
    assert.match(dash, /pendingInviteCount/);
    assert.match(dash, /PLATFORM_PERMISSIONS/);
    assert.doesNotMatch(dash, /mockOrgs|fakeCount|dummy/);
    assert.doesNotMatch(dash, /sm:grid-cols-2|xl:grid-cols-4|lg:grid-cols-2/);
    assert.match(dash, /EmptyState/);
    assert.match(dash, /accent="blue"/);
    assert.match(dash, /accent="green"/);
    assert.match(dash, /accent="violet"/);
    assert.match(dash, /accent="amber"/);
    assert.match(dash, /accent="orange"/);
  });

  it("keeps StatCard visual chrome outside breakpoint media queries", () => {
    const css = read("src/app/globals.css");
    const base = css.match(/\.stat-card\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    assert.match(base, /padding:\s*20px/);
    assert.match(base, /border:\s*1px solid/);
    assert.match(base, /border-radius:/);
    assert.match(base, /box-shadow:/);
    assert.match(base, /background-color:/);

    for (const variant of [
      "blue",
      "green",
      "violet",
      "amber",
      "orange",
      "neutral",
    ]) {
      assert.match(
        css,
        new RegExp(`\\.stat-card--${variant}\\s*\\{[^}]*background-color:`),
      );
    }

    const mediaBlocks = [...css.matchAll(/@media[^{]*\{([\s\S]*?)(?=\n@media|\n@container|\n*$)/g)].map(
      (m) => m[0],
    );
    for (const block of mediaBlocks) {
      assert.doesNotMatch(
        block,
        /\.stat-card[^{]*\{[^}]*(?:background(?:-color)?:\s*transparent|border:\s*none|box-shadow:\s*none|padding:\s*0\b)/,
      );
      assert.doesNotMatch(
        block,
        /\.card\s*\{[^}]*background(?:-color)?:\s*transparent/,
      );
    }

    assert.match(css, /@media \(min-width: 1024px\)/);
    assert.match(css, /@media \(min-width: 1280px\)/);
    assert.match(css, /container-type:\s*inline-size/);
    assert.match(css, /@container dashboard-summary \(min-width: 560px\)/);
    assert.match(css, /@container dashboard-summary \(min-width: 960px\)/);

    const shellOnly = css.match(
      /@media \(min-width: 1200px\)\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    assert.ok(shellOnly);
    assert.match(shellOnly, /\.desktop-sidebar/);
    assert.doesNotMatch(shellOnly, /\.stat-card/);
    assert.doesNotMatch(shellOnly, /\.dashboard-stat-grid/);
  });

  it("uses static stat variant mappings generated in production", () => {
    const source = read("src/components/ui/admin-ui.tsx");
    for (const className of [
      "stat-card--blue",
      "stat-card--green",
      "stat-card--violet",
      "stat-card--amber",
      "stat-card--orange",
    ]) {
      assert.ok(source.includes(className), className);
    }
    assert.doesNotMatch(source, /`bg-\$\{/);
  });
});

describe("GoldenSoft shadcn foundation", () => {
  it("configures shadcn for Tailwind v4, aliases, CSS variables, and Lucide", () => {
    const config = JSON.parse(read("components.json")) as {
      rsc?: boolean;
      tailwind?: { css?: string; cssVariables?: boolean };
      iconLibrary?: string;
      aliases?: Record<string, string>;
    };
    assert.equal(config.rsc, true);
    assert.equal(config.tailwind?.css, "src/app/globals.css");
    assert.equal(config.tailwind?.cssVariables, true);
    assert.equal(config.iconLibrary, "lucide");
    assert.equal(config.aliases?.ui, "@/components/ui");
    assert.match(read("src/lib/utils.ts"), /export function cn/);
  });

  it("provides token-based shadcn primitives and GoldenSoft page patterns", () => {
    for (const file of [
      "src/components/ui/button.tsx",
      "src/components/ui/card.tsx",
      "src/components/ui/input.tsx",
      "src/components/ui/dialog.tsx",
      "src/components/ui/sheet.tsx",
      "src/components/ui/table.tsx",
      "src/components/goldensoft/page.tsx",
      "src/components/goldensoft/confirm-dialog.tsx",
    ]) {
      assert.ok(fs.existsSync(path.join(ROOT, file)), file);
      assert.doesNotMatch(read(file), /\bany\b/, file);
    }

    const css = read("src/app/globals.css");
    for (const token of [
      "--card",
      "--card-foreground",
      "--secondary",
      "--muted",
      "--accent",
      "--destructive",
      "--input",
      "--ring",
      "--success-border",
      "--warning-border",
      "--info-border",
      "--header-background",
      "--sidebar-background",
    ]) {
      assert.match(css, new RegExp(`${token}:`), token);
    }
    assert.match(css, /\.dark\s*\{/);
  });

  it("uses shadcn and Lucide in the dashboard template and mobile sheet", () => {
    const dashboard = read("src/app/page.tsx");
    const shell = read("src/components/app-shell.tsx");
    assert.match(dashboard, /from "lucide-react"/);
    assert.match(dashboard, /SectionCard/);
    assert.match(dashboard, /IconTextLink|from "@\/components\/ui\/button"/);
    assert.match(shell, /SheetContent/);
    assert.match(shell, /from "lucide-react"/);
  });
});

describe("Phase 6 auth surfaces", () => {
  it("login and accept-invite use auth shell branding", () => {
    assert.match(read("src/app/login/page.tsx"), /auth-shell/);
    assert.match(read("src/app/auth\/accept-invite\/page.tsx"), /auth-shell/);
    assert.match(read("src/app/select-organization/page.tsx"), /auth-shell/);
    assert.match(read("src/components/login-form.tsx"), /FormField/);
    assert.match(read("src/components/accept-invite-form.tsx"), /FormField/);
  });

  it("invite wizard keeps step flow and mock badge gate for SUPER_ADMIN", () => {
    const wizard = read("src/components/user-invite-wizard.tsx");
    assert.match(wizard, /ขั้นตอนการเชิญผู้ใช้งาน|STEPS/);
    assert.match(wizard, /showTestModeBadge/);
    const invitePage = read("src/app/users/invite/page.tsx");
    assert.match(invitePage, /resolveInviteEnvironment/);
    assert.match(invitePage, /showTestModeBadge=\{isSuper && inviteMode === "mock"\}/);
  });
});

describe("Phase 6 security / regression guards", () => {
  it("does not flip AUTH_INVITE_MODE in source", () => {
    const inviteEnv = read("src/lib/auth/invite-env.ts");
    assert.match(inviteEnv, /AuthInviteMode = "mock" \| "real"/);
    assert.doesNotMatch(
      read("src/app/users/invite/page.tsx"),
      /AUTH_INVITE_MODE\s*=\s*["']real["']/,
    );
  });

  it("does not introduce a new UI framework dependency", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies ?? {});
    for (const banned of [
      "@mui/material",
      "antd",
      "@chakra-ui/react",
      "@mantine/core",
      "react-bootstrap",
    ]) {
      assert.equal(deps.includes(banned), false, banned);
    }
  });
});
