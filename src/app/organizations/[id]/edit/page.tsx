import { ArrowLeft } from "lucide-react";

import { PlatformShell } from "@/components/platform-shell";
import { OrgEditForm } from "@/components/org-edit-form";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { TH } from "@/lib/i18n/th";
import { canManageOrganization } from "@/lib/platform/organizations-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditOrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePlatformPage();
  const actor = await loadActorAccess(prisma, ctx.user.id);
  const shellProps = {
    displayName: ctx.bundle.profile?.displayName ?? TH.common.user,
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: membershipOrganizationOptions(ctx.bundle),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
  };

  if (!canManageOrganization(actor, id)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const org = await prisma.organization.findFirst({
    where: { id, deletedAt: null },
    select: {
      customerCode: true,
      displayName: true,
      legalName: true,
      taxId: true,
    },
  });
  if (!org) {
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
          title={TH.org.edit}
          actions={
            <IconTextLink
              href={`/organizations/${id}`}
              variant="outline"
              label={TH.common.back}
              icon={<ArrowLeft className="size-5" />}
            />
          }
        />
        <OrgEditForm
          organizationId={id}
          initial={{
            customerCode: org.customerCode,
            displayName: org.displayName,
            legalName: org.legalName,
            nameEn: null,
            taxId: org.taxId,
            email: null,
            phone: null,
            address: null,
          }}
        />
      </section>
    </PlatformShell>
  );
}
