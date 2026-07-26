import Link from "next/link";
import { Plus, Shield } from "lucide-react";

import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DataTable,
  PageHeader,
  SectionHeader,
} from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH, labelRole } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSION_LABELS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function CheckIcon() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]" aria-hidden="true">
      ✓
    </span>
  );
}

export default async function RolesPage() {
  const ctx = await requirePlatformPage();
  const perms = permissionsForRoles({
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
  });
  const shellProps = {
    displayName: ctx.bundle.profile?.displayName ?? TH.common.user,
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: ctx.bundle.memberships.map((m) => ({
      id: m.organizationId,
      name: m.organizationName,
    })),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
  };

  if (!perms.includes(PLATFORM_PERMISSIONS.roleRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const [platformRoles, organizationRoles] = await Promise.all([
    prisma.platformRole.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.organizationRole.findMany({
      where: {
        OR: [
          { organizationId: null, isSystem: true },
          ...(ctx.activeOrganization
            ? [{ organizationId: ctx.activeOrganization.id }]
            : []),
        ],
      },
      orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }],
    }),
  ]);
  const isSuper = ctx.bundle.platformRoles.includes("SUPER_ADMIN");
  const permissionCodes = Object.values(PLATFORM_PERMISSIONS);
  const canManage = perms.includes(PLATFORM_PERMISSIONS.roleManage);

  return (
    <PlatformShell
      {...shellProps}
      contextMode={ctx.contextMode}
      canUseManagedOrgMode={ctx.managedOrganizationIds.length > 0}
    >
      <PageHeader
        title={TH.pages.rolesTitle}
        description={TH.pages.rolesBody}
        icon={<Shield size={24} />}
        actions={
          canManage && ctx.activeOrganization ? (
            <IconTextLink
              href="/roles/new"
              label="สร้างบทบาทกำหนดเอง"
              icon={<Plus className="size-5" />}
            />
          ) : null
        }
      />

      <div className="grid gap-4">
        <section className="card">
          <SectionHeader title={TH.roles.platformRoles} />
          <ul className="mb-6 grid gap-3 sm:grid-cols-2">
            {platformRoles.map((r) => (
              <li
                key={r.id}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] p-3.5"
              >
                <p className="font-semibold text-[var(--text-primary)]">
                  {labelRole(r.code)}
                </p>
                <p className="mt-1 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
                  {r.nameTh}
                </p>
                {isSuper ? (
                  <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {r.code}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          <SectionHeader title={TH.roles.organizationRoles} />
          <ul className="grid gap-3 sm:grid-cols-2">
            {organizationRoles.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/roles/${r.id}`}
                  className="block rounded-[var(--radius-lg)] border border-[var(--border)] p-3.5 transition hover:border-[var(--border-strong)]"
                >
                  <p className="font-semibold text-[var(--text-primary)]">
                    {r.nameTh || labelRole(r.code)}
                  </p>
                  <p className="mt-1 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
                    {r.isSystem ? "บทบาทระบบ" : "บทบาทกำหนดเอง"}
                    {r.isActive ? "" : " · ปิดใช้งาน"}
                  </p>
                  {isSuper ? (
                    <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {r.code}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <SectionHeader
            title={TH.roles.permissionMatrix}
            description="รายการสิทธิ์ที่ระบบรองรับ จัดกลุ่มตามการใช้งาน"
          />
          <DataTable
            headers={[
              "สิทธิ์",
              "สถานะ",
              ...(isSuper ? ["รหัส"] : []),
            ]}
          >
            {permissionCodes.map((code) => (
              <tr
                key={code}
                className="border-b border-[var(--border)] hover:bg-[var(--surface-muted)]/60"
              >
                <td className="px-3 py-2.5">
                  {PLATFORM_PERMISSION_LABELS[code]}
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-2 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
                    <CheckIcon />
                    มีในระบบ
                  </span>
                </td>
                {isSuper ? (
                  <td className="px-3 py-2.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {code}
                  </td>
                ) : null}
              </tr>
            ))}
          </DataTable>
          <ul className="mt-4 space-y-2 md:hidden">
            {permissionCodes.map((code) => (
              <li
                key={code}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] p-3 text-[length:var(--text-label)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{PLATFORM_PERMISSION_LABELS[code]}</p>
                  <CheckIcon />
                </div>
                {isSuper ? (
                  <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {code}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PlatformShell>
  );
}
