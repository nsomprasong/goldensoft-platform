import Link from "next/link";
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
import { TH, labelRole } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSION_LABELS,
  permissionsForRoles,
  type PlatformPermission,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function RoleDetailPage({ params }: Props) {
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

  const canEdit =
    !role.isSystem &&
    perms.includes(PLATFORM_PERMISSIONS.roleManage) &&
    role.organizationId === ctx.activeOrganization?.id;

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
          canEdit ? (
            <IconTextLink
              href={`/roles/${role.id}/edit`}
              label="แก้ไขสิทธิ์"
              icon={<Pencil className="size-5" />}
            />
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
        <SectionHeader title="สิทธิ์" />
        <ul className="grid gap-2">
          {role.permissions.map((row) => (
            <li key={row.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
              <p className="font-medium">
                {PLATFORM_PERMISSION_LABELS[
                  row.permission.code as PlatformPermission
                ] ?? row.permission.nameTh}
              </p>
              <p className="text-[length:var(--text-caption)] text-[var(--text-secondary)]">
                {row.permission.descriptionTh ?? row.permission.code}
              </p>
            </li>
          ))}
        </ul>
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
