import { Landmark } from "lucide-react";

import { CustomerRoleOrganizationPicker } from "@/components/customer-role-organization-picker";
import { PlatformShell } from "@/components/platform-shell";
import { RoleManagementSubmenu } from "@/components/role-management-submenu";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { TH } from "@/lib/i18n/th";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";
import { isGoldenSoftCustomerCode } from "@/lib/platform/bootstrap-organization";
import { resolveActorPermissionCodes } from "@/lib/platform/custom-roles";
import { MASTER } from "@/lib/platform/master-codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CustomerOrganizationRolesPage() {
  const ctx = await requirePlatformPage();
  const organizationId = ctx.activeOrganization?.id ?? null;
  const platformContext =
    ctx.contextMode === "platform_admin" &&
    isGoldenSoftCustomerCode(ctx.activeOrganization?.customerCode);
  const shellProps = {
    displayName: ctx.bundle.profile?.displayName ?? TH.common.user,
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: membershipOrganizationOptions(ctx.bundle),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
    contextMode: ctx.contextMode,
    canUseManagedOrgMode: ctx.managedOrganizationIds.length > 0,
  };
  const permissions = await resolveActorPermissionCodes(prisma, {
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: [],
  });
  const canManageRoles = permissions.includes(PLATFORM_PERMISSIONS.roleManage);
  if (!organizationId || !platformContext || !canManageRoles) {
    return <PlatformShell {...shellProps}><AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} /></PlatformShell>;
  }

  const canManageEveryOrganization = ctx.bundle.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
  const organizations = await prisma.organization.findMany({
    where: {
      deletedAt: null,
      status: { code: MASTER.organizationStatus.ACTIVE },
      NOT: { id: organizationId },
      ...(canManageEveryOrganization ? {} : { id: { in: ctx.managedOrganizationIds } }),
    },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
    take: 200,
  });

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title="บทบาทองค์กรลูกค้า"
        description="เลือกองค์กรเพื่อจัดการบทบาทมาตรฐาน บทบาทที่องค์กรสร้าง และสิทธิ์ขององค์กรนั้น"
        icon={<Landmark size={24} />}
      />
      <div className="mx-auto w-full max-w-6xl pb-24">
        <CustomerRoleOrganizationPicker
          organizations={organizations.map((organization) => ({ id: organization.id, name: organization.displayName }))}
        />
      </div>
      <RoleManagementSubmenu active="customer-roles" organizationId={organizationId} platformContext />
    </PlatformShell>
  );
}
