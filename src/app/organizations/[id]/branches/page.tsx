import { ArrowLeft, GitBranch, Pencil, Plus } from "lucide-react";

import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DataTable,
  EmptyState,
  MobileRecordCard,
  PageHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
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
      <PageHeader
        title={TH.pages.branchesTitle}
        description={TH.pages.branchesBody}
        icon={<GitBranch size={24} />}
        actions={
          canManage ? (
            <IconTextLink
              href={`/organizations/${id}/branches/new`}
              label={TH.branch.add}
              icon={<Plus className="size-5" />}
            />
          ) : null
        }
      />
      <section className="card">
        {branches.length === 0 ? (
          <EmptyState title={TH.common.empty} />
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {branches.map((b) => (
                <li key={b.id}>
                  <MobileRecordCard
                    title={b.name}
                    subtitle={b.code}
                    status={
                      <StatusBadge
                        label={labelStatus(b.status.code)}
                        code={b.status.code}
                      />
                    }
                    actions={
                      canManage ? (
                        <IconTextLink
                          href={`/organizations/${id}/branches/${b.id}/edit`}
                          variant="outline"
                          size="sm"
                          label={TH.common.edit}
                          icon={<Pencil className="size-4" />}
                        />
                      ) : null
                    }
                  />
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
                <tr
                  key={b.id}
                  className="border-b border-[var(--border)] hover:bg-[var(--surface-muted)]/60"
                >
                  <td className="px-3 py-2.5 font-medium">{b.name}</td>
                  <td className="px-3 py-2.5">{b.code}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      label={labelStatus(b.status.code)}
                      code={b.status.code}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    {canManage ? (
                      <IconTextLink
                        href={`/organizations/${id}/branches/${b.id}/edit`}
                        variant="outline"
                        size="sm"
                        label={TH.common.edit}
                        icon={<Pencil className="size-4" />}
                      />
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
