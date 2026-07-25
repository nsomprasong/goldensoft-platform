import { notFound } from "next/navigation";

import { CustomRoleForm } from "@/components/custom-role-form";
import { PlatformShell } from "@/components/platform-shell";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { IconRoles } from "@/components/ui/icons";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditCustomRolePage({ params }: Props) {
  const ctx = await requirePlatformPage();
  const { id } = await params;
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

  const canEdit =
    !role.isSystem &&
    perms.includes(PLATFORM_PERMISSIONS.roleManage) &&
    role.organizationId === ctx.activeOrganization?.id;

  if (!canEdit) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={`แก้ไขบทบาท: ${role.nameTh}`}
        description={role.code}
        icon={<IconRoles size={24} />}
      />
      <CustomRoleForm
        mode="edit"
        roleId={role.id}
        organizationId={role.organizationId!}
        initial={{
          code: role.code,
          nameTh: role.nameTh,
          nameEn: role.nameEn,
          description: role.description ?? "",
          permissionCodes: role.permissions.map((p) => p.permission.code),
          isSystem: role.isSystem,
        }}
      />
    </PlatformShell>
  );
}
