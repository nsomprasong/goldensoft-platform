import { ArrowLeft } from "lucide-react";

import { BranchForm } from "@/components/branch-form";
import { PlatformShell } from "@/components/platform-shell";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";
import { canManageOrganization } from "@/lib/platform/organizations-admin";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditBranchPage({
  params,
}: {
  params: Promise<{ id: string; branchId: string }>;
}) {
  const { id, branchId } = await params;
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

  if (
    !canManageOrganization(actor, id) ||
    !perms.includes(PLATFORM_PERMISSIONS.branchManage)
  ) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, organizationId: id, deletedAt: null },
    select: {
      code: true,
      name: true,
      address: true,
      timezone: true,
    },
  });
  if (!branch) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.common.notFound} body={TH.common.notFound} />
      </PlatformShell>
    );
  }

  return (
    <PlatformShell {...shellProps}>
      <section className="card max-w-xl">
        <PageHeader
          title={TH.branch.edit}
          actions={
            <IconTextLink
              href={`/organizations/${id}/branches`}
              variant="outline"
              label={TH.common.back}
              icon={<ArrowLeft className="size-5" />}
            />
          }
        />
        <BranchForm
          organizationId={id}
          branchId={branchId}
          mode="edit"
          initial={{
            code: branch.code,
            name: branch.name,
            nameEn: null,
            address: branch.address,
            email: null,
            phone: null,
            timezone: branch.timezone,
            isPrimary: false,
          }}
        />
      </section>
    </PlatformShell>
  );
}
