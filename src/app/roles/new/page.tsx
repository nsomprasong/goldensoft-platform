import { ArrowLeft, Shield } from "lucide-react";

import { CustomRoleForm } from "@/components/custom-role-form";
import { PlatformShell } from "@/components/platform-shell";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";

export const dynamic = "force-dynamic";

export default async function NewCustomRolePage() {
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
    contextMode: ctx.contextMode,
  };

  if (!perms.includes(PLATFORM_PERMISSIONS.roleManage) || !ctx.activeOrganization) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title="สร้างบทบาทกำหนดเอง"
        description={`องค์กร: ${ctx.activeOrganization.name}`}
        icon={<Shield size={24} />}
        actions={
          <IconTextLink
            href="/roles"
            variant="outline"
            label="กลับ"
            icon={<ArrowLeft className="size-5" />}
          />
        }
      />
      <CustomRoleForm
        mode="create"
        organizationId={ctx.activeOrganization.id}
      />
    </PlatformShell>
  );
}
