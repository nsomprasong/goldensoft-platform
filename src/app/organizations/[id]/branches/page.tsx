import Link from "next/link";

import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DataTable,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH, labelStatus } from "@/lib/i18n/th";
import { listBranches } from "@/lib/platform/branches-admin";
import { canManageOrganization } from "@/lib/platform/organizations-admin";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OrganizationBranchesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePlatformPage();
  const actor = await loadActorAccess(prisma, ctx.user.id);
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles,
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

  if (!perms.includes(PLATFORM_PERMISSIONS.branchRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  let branches;
  try {
    branches = await listBranches(prisma, actor, id);
  } catch {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const canManage =
    canManageOrganization(actor, id) &&
    perms.includes(PLATFORM_PERMISSIONS.branchManage);

  return (
    <PlatformShell {...shellProps}>
      <section className="card">
        <PageHeader
          title={TH.pages.branchesTitle}
          actions={
            canManage ? (
              <Link href={`/organizations/${id}/branches/new`} className="btn">
                {TH.branch.add}
              </Link>
            ) : null
          }
        />
        {branches.length === 0 ? (
          <EmptyState title={TH.common.empty} />
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {branches.map((b) => (
                <li key={b.id} className="rounded-xl border border-[var(--border)] p-3">
                  <p className="font-medium">
                    {b.name}{" "}
                    {/* isPrimary requires migration 0002 */}
                  </p>
                  <p className="text-xs text-slate-500">{b.code}</p>
                  <StatusBadge label={labelStatus(b.status.code)} />
                </li>
              ))}
            </ul>
            <DataTable
              headers={[
                TH.branch.nameTh,
                TH.branch.code,
                TH.common.status,
                TH.common.actions,
              ]}
            >
              {branches.map((b) => (
                <tr key={b.id} className="border-b border-[var(--border)]">
                  <td className="px-2 py-2">{b.name}</td>
                  <td className="px-2 py-2">{b.code}</td>
                  <td className="px-2 py-2">
                    <StatusBadge label={labelStatus(b.status.code)} />
                  </td>
                  <td className="px-2 py-2">
                    {canManage ? (
                      <Link
                        href={`/organizations/${id}/branches/${b.id}/edit`}
                        className="text-sm text-[var(--accent)]"
                      >
                        {TH.common.edit}
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </DataTable>
          </>
        )}
      </section>
    </PlatformShell>
  );
}
