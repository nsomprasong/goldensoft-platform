import { notFound } from "next/navigation";
import { Shield } from "lucide-react";

import { CustomRoleForm } from "@/components/custom-role-form";
import { PlatformShell } from "@/components/platform-shell";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
} from "@/lib/permissions/codes";
import { displayPermissionCodesForRole } from "@/lib/platform/custom-roles";
import { MASTER } from "@/lib/platform/master-codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditOrganizationRolePage({ params }: Props) {
  const ctx = await requirePlatformPage();
  const { id } = await params;
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
    canUseManagedOrgMode: ctx.managedOrganizationIds.length > 0,
  };

  const role = await prisma.organizationRole.findUnique({
    where: { id },
    include: {
      permissions: {
        where: { revokedAt: null },
        include: { permission: { select: { code: true } } },
      },
    },
  });
  if (!role) notFound();

  const isSuper = ctx.bundle.platformRoles.includes(
    MASTER.platformRole.SUPER_ADMIN,
  );
  const canManage = ctx.permissionCodes.includes(PLATFORM_PERMISSIONS.roleManage);
  const canEditCustom =
    !role.isSystem &&
    canManage &&
    role.organizationId === ctx.activeOrganization?.id;
  const canEditSystem = role.isSystem && isSuper;
  const canEdit = canEditCustom || canEditSystem;

  if (!canEdit) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const permissionCodes = displayPermissionCodesForRole({
    isSystem: role.isSystem,
    code: role.code,
    dbPermissionCodes: role.permissions.map((p) => p.permission.code),
  });

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={`แก้ไขสิทธิ์: ${role.nameTh}`}
        description={
          role.isSystem
            ? "บทบาทระบบ — เลือกสิทธิ์ที่จะให้ผู้ใช้ที่มีบทบาทนี้"
            : role.code
        }
        icon={<Shield size={24} />}
      />
      <CustomRoleForm
        mode="edit"
        roleId={role.id}
        organizationId={role.organizationId}
        allowSystemPermissionEdit={canEditSystem}
        initial={{
          code: role.code,
          nameTh: role.nameTh,
          nameEn: role.nameEn,
          description: role.description ?? "",
          permissionCodes,
          isSystem: role.isSystem,
        }}
      />
    </PlatformShell>
  );
}
