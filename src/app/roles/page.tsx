import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DataTable,
  PageHeader,
} from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH, labelRole } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSION_LABELS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
    prisma.organizationRole.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const isSuper = ctx.bundle.platformRoles.includes("SUPER_ADMIN");

  return (
    <PlatformShell {...shellProps}>
      <section className="card mb-4">
        <PageHeader
          title={TH.pages.rolesTitle}
          description={TH.roles.systemImmutable}
        />
        <h3 className="mb-2 font-semibold">{TH.roles.platformRoles}</h3>
        <ul className="mb-4 space-y-1 text-sm">
          {platformRoles.map((r) => (
            <li key={r.id}>
              {labelRole(r.code)}
              {isSuper ? (
                <span className="ml-2 text-xs text-slate-500">({r.code})</span>
              ) : null}
              <span className="block text-xs text-slate-500">{r.nameTh}</span>
            </li>
          ))}
        </ul>
        <h3 className="mb-2 font-semibold">{TH.roles.organizationRoles}</h3>
        <ul className="space-y-1 text-sm">
          {organizationRoles.map((r) => (
            <li key={r.id}>
              {labelRole(r.code)}
              {isSuper ? (
                <span className="ml-2 text-xs text-slate-500">({r.code})</span>
              ) : null}
              <span className="block text-xs text-slate-500">{r.nameTh}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3 className="mb-3 font-semibold">{TH.roles.permissionMatrix}</h3>
        <DataTable headers={["สิทธิ์", "คำอธิบาย", ...(isSuper ? ["รหัส"] : [])]}>
          {Object.values(PLATFORM_PERMISSIONS).map((code) => (
            <tr key={code} className="border-b border-[var(--border)]">
              <td className="px-2 py-2">
                {PLATFORM_PERMISSION_LABELS[code]}
              </td>
              <td className="px-2 py-2 text-sm text-slate-600">
                {PLATFORM_PERMISSION_LABELS[code]}
              </td>
              {isSuper ? (
                <td className="px-2 py-2 text-xs text-slate-500">{code}</td>
              ) : null}
            </tr>
          ))}
        </DataTable>
        <ul className="mt-4 space-y-2 md:hidden">
          {Object.values(PLATFORM_PERMISSIONS).map((code) => (
            <li key={code} className="rounded-xl border border-[var(--border)] p-3 text-sm">
              <p className="font-medium">{PLATFORM_PERMISSION_LABELS[code]}</p>
              {isSuper ? (
                <p className="text-xs text-slate-500">{code}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </PlatformShell>
  );
}
