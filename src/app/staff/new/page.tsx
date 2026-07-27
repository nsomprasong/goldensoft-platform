import { ArrowLeft, UserPlus } from "lucide-react";

import { PlatformShell } from "@/components/platform-shell";
import { StaffCreateForm } from "@/components/staff-create-form";
import {
  AccessDenied,
  PageHeader,
} from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";
import { canManageStaff } from "@/lib/platform/staff";
import { isInvitationSendEnabled } from "@/lib/platform/system-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewStaffPage() {
  const ctx = await requirePlatformPage();
  const actor = { platformRoles: ctx.bundle.platformRoles };
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
    pageTitle: TH.staff.add,
    contextMode: ctx.contextMode,
    canUseManagedOrgMode: ctx.managedOrganizationIds.length > 0,
  };

  if (!canManageStaff(actor)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const [platformRoles, invitationsSendEnabled] = await Promise.all([
    prisma.platformRole.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
    isInvitationSendEnabled(prisma),
  ]);

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={TH.staff.add}
        description={TH.staff.addBody}
        icon={<UserPlus size={24} />}
        actions={
          <IconTextLink
            href="/staff"
            variant="outline"
            label={TH.common.back}
            icon={<ArrowLeft className="size-5" />}
          />
        }
      />

      <section className="card mx-auto max-w-3xl">
        <StaffCreateForm
          roles={platformRoles}
          invitationsSendEnabled={invitationsSendEnabled}
        />
      </section>
    </PlatformShell>
  );
}
