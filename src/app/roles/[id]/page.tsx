import { Pencil, Shield } from "lucide-react";
import { notFound } from "next/navigation";

import { DeleteCustomRoleButton } from "@/components/delete-custom-role-button";
import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DetailList,
  PageHeader,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { TH, labelRole } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSION_LABELS,
  type PlatformPermission,
} from "@/lib/permissions/codes";
import { displayPermissionCodesForRole } from "@/lib/platform/custom-roles";
import { MASTER } from "@/lib/platform/master-codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function RoleDetailPage({ params }: Props) {
  const ctx = await requirePlatformPage();
  const { id } = await params;
  const perms = ctx.permissionCodes;
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

  if (!perms.includes(PLATFORM_PERMISSIONS.roleRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const role = await prisma.organizationRole.findUnique({
    where: { id },
    include: {
      permissions: {
        where: { revokedAt: null },
        include: { permission: true },
      },
      assignments: {
        where: { revokedAt: null },
        take: 50,
        include: {
          membership: {
            include: {
              userProfile: {
                select: { displayName: true, email: true },
              },
            },
          },
        },
      },
    },
  });
  if (!role) notFound();

  const isSuper = ctx.bundle.platformRoles.includes(
    MASTER.platformRole.SUPER_ADMIN,
  );
  const canEdit =
    (role.isSystem && isSuper) ||
    (!role.isSystem &&
      perms.includes(PLATFORM_PERMISSIONS.roleManage) &&
      role.organizationId === ctx.activeOrganization?.id);
  const canDelete =
    !role.isSystem &&
    perms.includes(PLATFORM_PERMISSIONS.roleManage) &&
    role.organizationId === ctx.activeOrganization?.id;

  const permissionCodes = displayPermissionCodesForRole({
    isSystem: role.isSystem,
    code: role.code,
    dbPermissionCodes: role.permissions.map((row) => row.permission.code),
  });
  const permissionMetaByCode = new Map(
    role.permissions.map((row) => [row.permission.code, row.permission]),
  );

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={role.nameTh || labelRole(role.code)}
        description={role.description ?? role.nameEn}
        icon={<Shield size={24} />}
        status={
          <StatusBadge
            label={role.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
            code={role.isActive ? "ACTIVE" : "INACTIVE"}
          />
        }
        actions={
          canEdit || canDelete ? (
            <div className="flex flex-wrap items-start gap-2">
              {canEdit ? (
                <IconTextLink
                  href={`/roles/${role.id}/edit`}
                  label="แก้ไขสิทธิ์"
                  icon={<Pencil className="size-5" />}
                />
              ) : null}
              {canDelete ? (
                <DeleteCustomRoleButton
                  roleId={role.id}
                  roleName={role.nameTh || role.code}
                  redirectTo="/roles"
                />
              ) : null}
            </div>
          ) : null
        }
      />
      <section className="card mb-4">
        <DetailList
          items={[
            { label: "รหัส", value: role.code },
            {
              label: "ประเภท",
              value: role.isSystem ? "บทบาทระบบ" : "บทบาทกำหนดเอง",
            },
            {
              label: "องค์กร",
              value: role.organizationId
                ? (ctx.activeOrganization?.name ?? role.organizationId)
                : "ทั้งแพลตฟอร์ม",
            },
          ]}
        />
      </section>
      <section className="card mb-4">
        <SectionHeader
          title="สิทธิ์"
          description={
            role.isSystem && role.permissions.length === 0
              ? "ยังไม่ได้บันทึกในฐานข้อมูล — แสดงค่าเริ่มต้นของระบบ (กดแก้ไขสิทธิ์เพื่อปรับและบันทึก)"
              : undefined
          }
        />
        {permissionCodes.length === 0 ? (
          <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
            ยังไม่มีสิทธิ์ในบทบาทนี้
          </p>
        ) : (
          <ul className="grid gap-2">
            {permissionCodes.map((code) => {
              const meta = permissionMetaByCode.get(code);
              return (
                <li
                  key={code}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] p-3"
                >
                  <p className="font-medium">
                    {PLATFORM_PERMISSION_LABELS[code as PlatformPermission] ??
                      meta?.nameTh ??
                      code}
                  </p>
                  <p className="text-[length:var(--text-caption)] text-[var(--text-secondary)]">
                    {meta?.descriptionTh ?? code}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="card">
        <SectionHeader title="ผู้ใช้ที่ได้รับบทบาท" />
        {role.assignments.length === 0 ? (
          <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
            ยังไม่มีผู้ใช้ได้รับบทบาทนี้
          </p>
        ) : (
          <ul className="grid gap-2">
            {role.assignments.map((a) => (
              <li key={a.id}>
                {a.membership.userProfile.displayName} ·{" "}
                {a.membership.userProfile.email}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PlatformShell>
  );
}
