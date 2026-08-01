import { Pencil, Shield } from "lucide-react";
import { notFound } from "next/navigation";

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
  PLATFORM_PERMISSION_LABELS,
  type PlatformPermission,
} from "@/lib/permissions/codes";
import { MASTER } from "@/lib/platform/master-codes";
import { displayPermissionCodesForPlatformRole } from "@/lib/platform/platform-roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function PlatformRoleDetailPage({ params }: Props) {
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
        include: { permission: true },
      },
      assignments: {
        where: { revokedAt: null },
        take: 50,
        include: {
          userProfile: { select: { displayName: true, email: true } },
        },
      },
    },
  });
  if (!role) notFound();

  const permissionCodes = displayPermissionCodesForPlatformRole({
    code: role.code,
    dbPermissionCodes: role.permissions.map((row) => row.permission.code),
  });
  const permissionMetaByCode = new Map(
    role.permissions.map((row) => [row.permission.code, row.permission]),
  );
  const isSuperRole = role.code === MASTER.platformRole.SUPER_ADMIN;

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
          <IconTextLink
            href={`/roles/platform/${role.id}/edit`}
            label={isSuperRole ? "แก้ไขคำอธิบาย" : "แก้ไขสิทธิ์"}
            icon={<Pencil className="size-5" />}
          />
        }
      />
      <section className="card mb-4">
        <DetailList
          items={[
            { label: "รหัส", value: role.code },
            { label: "ประเภท", value: "บทบาทระดับแพลตฟอร์ม" },
            {
              label: "ขอบเขต",
              value: "พนักงาน GoldenSoft (ไม่ผูกองค์กรลูกค้า)",
            },
          ]}
        />
      </section>
      <section className="card mb-4">
        <SectionHeader
          title="สิทธิ์"
          description={
            isSuperRole
              ? "SUPER_ADMIN มีสิทธิ์ทั้งหมดเสมอ"
              : role.permissions.length === 0
                ? "ยังไม่ได้บันทึกในฐานข้อมูล — แสดงค่าเริ่มต้น (กดแก้ไขสิทธิ์เพื่อปรับและบันทึก)"
                : undefined
          }
        />
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
      </section>
      <section className="card">
        <SectionHeader title="พนักงานที่ได้รับบทบาท" />
        {role.assignments.length === 0 ? (
          <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
            ยังไม่มีพนักงานได้รับบทบาทนี้
          </p>
        ) : (
          <ul className="grid gap-2">
            {role.assignments.map((a) => (
              <li key={a.id}>
                {a.userProfile.displayName} · {a.userProfile.email}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PlatformShell>
  );
}
