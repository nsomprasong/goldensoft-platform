import { Shield } from "lucide-react";
import { notFound } from "next/navigation";

import { CustomRoleForm } from "@/components/custom-role-form";
import { PlatformShell } from "@/components/platform-shell";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { TH } from "@/lib/i18n/th";
import { loadPermissionRegistry } from "@/lib/permissions/registry";
import { MASTER } from "@/lib/platform/master-codes";
import { displayPermissionCodesForPlatformRole } from "@/lib/platform/platform-roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditPlatformRolePage({ params }: Props) {
  const ctx = await requirePlatformPage();
  const { id } = await params;
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

  const isSuper = ctx.bundle.platformRoles.includes(
    MASTER.platformRole.SUPER_ADMIN,
  );
  if (!isSuper) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const role = await prisma.platformRole.findUnique({
    where: { id },
    include: {
      permissions: {
        where: { revokedAt: null },
        include: { permission: { select: { code: true } } },
      },
    },
  });
  if (!role) notFound();

  const isSuperRole = role.code === MASTER.platformRole.SUPER_ADMIN;
  const permissionCodes = displayPermissionCodesForPlatformRole({
    code: role.code,
    dbPermissionCodes: role.permissions.map((p) => p.permission.code),
  });
  const permissionCatalog = await loadPermissionRegistry(prisma, { platform: true });

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={`แก้ไขบทบาทแพลตฟอร์ม: ${role.nameTh}`}
        description={
          isSuperRole
            ? "SUPER_ADMIN มีสิทธิ์ทั้งหมดเสมอ — แก้ได้เฉพาะคำอธิบาย"
            : role.code
        }
        icon={<Shield size={24} />}
      />
      <CustomRoleForm
        mode="edit"
        roleKind="platform"
        roleId={role.id}
        organizationId={null}
        allowSystemPermissionEdit={!isSuperRole}
        lockPermissions={isSuperRole}
        permissionCatalog={permissionCatalog}
        initial={{
          code: role.code,
          nameTh: role.nameTh,
          nameEn: role.nameEn,
          description: role.description ?? "",
          permissionCodes,
          isSystem: true,
        }}
      />
    </PlatformShell>
  );
}
