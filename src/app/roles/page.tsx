import Link from "next/link";
import { Pencil, Plus, Shield, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { DeleteCustomRoleButton } from "@/components/delete-custom-role-button";
import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DataTable,
  PageHeader,
  SectionHeader,
} from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { TH, labelRole } from "@/lib/i18n/th";
import {
  ORGANIZATION_ASSIGNABLE_PERMISSIONS,
  PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSION_LABELS,
} from "@/lib/permissions/codes";
import { MASTER } from "@/lib/platform/master-codes";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function CheckIcon() {
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]"
      aria-hidden="true"
    >
      ✓
    </span>
  );
}

function RoleCard(props: {
  href?: string;
  title: string;
  subtitle: string;
  meta?: string;
  badge?: string;
  action?: ReactNode;
}) {
  const content = (
    <div className="flex min-w-0 items-start gap-3">
      <span
        className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--primary)]"
        aria-hidden="true"
      >
        <ShieldCheck className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-[var(--text-primary)]">
            {props.title}
          </p>
          {props.badge ? (
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
              {props.badge}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
          {props.subtitle}
        </p>
        {props.meta ? (
          <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {props.meta}
          </p>
        ) : null}
      </div>
    </div>
  );

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-xs)] transition",
        "hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]",
        "sm:flex-row sm:items-center sm:justify-between sm:gap-4",
      )}
    >
      {props.href ? (
        <Link
          href={props.href}
          className="min-w-0 flex-1 rounded-[var(--radius-md)] outline-none transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {content}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{content}</div>
      )}
      {props.action ? (
        <div className="flex shrink-0 justify-end sm:justify-end">
          {props.action}
        </div>
      ) : null}
    </li>
  );
}

function SoftEditLink(props: { href: string; label: string }) {
  return (
    <IconTextLink
      href={props.href}
      label={props.label}
      size="sm"
      icon={<Pencil className="size-3.5" aria-hidden="true" />}
    />
  );
}

export default async function RolesPage() {
  const ctx = await requirePlatformPage();
  const perms = ctx.permissionCodes;
  const shellProps = {
    displayName: ctx.bundle.profile?.displayName ?? TH.common.user,
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: membershipOrganizationOptions(ctx.bundle),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
  };

  if (!perms.includes(PLATFORM_PERMISSIONS.roleRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const [platformRoles, organizationRoles] = await Promise.all([
    ctx.activeOrganization
      ? Promise.resolve([])
      : prisma.platformRole.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { assignments: true } } } }),
    prisma.organizationRole.findMany({
      where: {
        OR: [
          { organizationId: null, isSystem: true },
          ...(ctx.activeOrganization
            ? [{ organizationId: ctx.activeOrganization.id }]
            : []),
        ],
      },
      orderBy: [{ isSystem: "desc" }, { isActive: "desc" }, { sortOrder: "asc" }],
      include: { _count: { select: { assignments: true } } },
    }),
  ]);
  const isSuper = ctx.bundle.platformRoles.includes(
    MASTER.platformRole.SUPER_ADMIN,
  );
  const positionCountRows = ctx.activeOrganization
    ? await prisma.$queryRaw<Array<{ role_id: string; count: bigint }>>`
        SELECT pr.organization_role_id::text AS role_id, COUNT(*)::bigint AS count
        FROM hr.position_roles pr
        JOIN hr.positions p ON p.id = pr.position_id
        WHERE p.organization_id = ${ctx.activeOrganization.id}::uuid
        GROUP BY pr.organization_role_id
      `
    : [];
  const positionCounts = new Map(positionCountRows.map((row) => [row.role_id, Number(row.count)]));
  const inOrgContext = Boolean(ctx.activeOrganization);
  const permissionCodes = inOrgContext
    ? [...ORGANIZATION_ASSIGNABLE_PERMISSIONS]
    : Object.values(PLATFORM_PERMISSIONS);
  const canManage = perms.includes(PLATFORM_PERMISSIONS.roleManage);

  return (
    <PlatformShell
      {...shellProps}
      contextMode={ctx.contextMode}
      canUseManagedOrgMode={ctx.managedOrganizationIds.length > 0}
    >
      <PageHeader
        title={TH.pages.rolesTitle}
        description={TH.pages.rolesBody}
        icon={<Shield size={24} />}
        actions={
          canManage && ctx.activeOrganization ? (
            <IconTextLink
              href="/roles/new"
              label="สร้างบทบาทกำหนดเอง"
              icon={<Plus className="size-5" />}
            />
          ) : null
        }
      />

      <div className="grid gap-5">
        {!inOrgContext ? (
          <section className="card space-y-4">
            <SectionHeader
              title={TH.roles.platformRoles}
              description="บทบาทพนักงาน GoldenSoft ระดับแพลตฟอร์ม"
            />
            <ul className="grid gap-3">
              {platformRoles.map((r) => (
                <RoleCard
                  key={r.id}
                  href={isSuper ? `/roles/platform/${r.id}` : undefined}
                  title={labelRole(r.code)}
                  subtitle={r.nameTh}
                  meta={`พนักงานที่ใช้บทบาท ${r._count.assignments} คน · ${r.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"} · แก้ไขล่าสุด ${new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(r.updatedAt)}`}
                  badge="บทบาทระดับแพลตฟอร์ม"
                  action={
                    isSuper ? (
                      <SoftEditLink
                        href={`/roles/platform/${r.id}/edit`}
                        label={
                          r.code === MASTER.platformRole.SUPER_ADMIN
                            ? "แก้ไขคำอธิบาย"
                            : "แก้ไขสิทธิ์"
                        }
                      />
                    ) : null
                  }
                />
              ))}
            </ul>
          </section>
        ) : null}

        <section className="card space-y-4">
          <SectionHeader
            title={TH.roles.organizationRoles}
            description={
              inOrgContext
                ? `บทบาทขององค์กร ${ctx.activeOrganization?.name ?? ""} — ไม่รวมสิทธิ์ระดับแพลตฟอร์ม`
                : "บทบาทภายในองค์กรลูกค้า — บทบาทกำหนดเองลบได้เมื่อไม่มีผู้ใช้หรือคำเชิญอ้างอิง"
            }
          />
          <ul className="grid gap-3">
            {organizationRoles.map((r) => {
              const canEditRole =
                (r.isSystem && isSuper) ||
                (!r.isSystem &&
                  canManage &&
                  r.organizationId === ctx.activeOrganization?.id);
              const canDeleteRole =
                !r.isSystem &&
                canManage &&
                r.organizationId === ctx.activeOrganization?.id;
              return (
                <RoleCard
                  key={r.id}
                  href={`/roles/${r.id}`}
                  title={r.nameTh || labelRole(r.code)}
                  subtitle={
                    `${r.isSystem ? "บทบาทมาตรฐาน · ใช้ได้ทุกองค์กร" : "บทบาทที่องค์กรสร้าง · ใช้เฉพาะองค์กรนี้"}${
                      r.isActive ? "" : " · ปิดใช้งาน"
                    }`
                  }
                  meta={`ตำแหน่งที่ผูก ${positionCounts.get(r.id) ?? 0} ตำแหน่ง · พนักงานที่ใช้บทบาท ${r._count.assignments} คน · ${r.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"} · แก้ไขล่าสุด ${new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(r.updatedAt)}`}
                  badge={r.isSystem ? "บทบาทมาตรฐาน" : "บทบาทขององค์กร"}
                  action={
                    canEditRole || canDeleteRole ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {canEditRole ? (
                          <SoftEditLink
                            href={`/roles/${r.id}/edit`}
                            label="แก้ไขสิทธิ์"
                          />
                        ) : null}
                        {canDeleteRole ? (
                          <DeleteCustomRoleButton
                            roleId={r.id}
                            roleName={r.nameTh || r.code}
                            size="sm"
                          />
                        ) : null}
                      </div>
                    ) : null
                  }
                />
              );
            })}
          </ul>
        </section>

        <section className="card space-y-4">
          <SectionHeader
            title={TH.roles.permissionMatrix}
            description={
              inOrgContext
                ? "สิทธิ์ที่กำหนดให้บทบาทองค์กรได้เท่านั้น"
                : "รายการสิทธิ์ที่ระบบรองรับ จัดกลุ่มตามการใช้งาน"
            }
          />
          <DataTable
            headers={[
              "สิทธิ์",
              "สถานะ",
              ...(isSuper ? ["รหัส"] : []),
            ]}
          >
            {permissionCodes.map((code) => (
              <tr
                key={code}
                className="border-b border-[var(--border)] hover:bg-[var(--surface-muted)]/60"
              >
                <td className="px-3 py-2.5">
                  {PLATFORM_PERMISSION_LABELS[code]}
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-2 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
                    <CheckIcon />
                    มีในระบบ
                  </span>
                </td>
                {isSuper ? (
                  <td className="px-3 py-2.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {code}
                  </td>
                ) : null}
              </tr>
            ))}
          </DataTable>
          <ul className="mt-4 space-y-2 md:hidden">
            {permissionCodes.map((code) => (
              <li
                key={code}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] p-3 text-[length:var(--text-label)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{PLATFORM_PERMISSION_LABELS[code]}</p>
                  <CheckIcon />
                </div>
                {isSuper ? (
                  <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {code}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PlatformShell>
  );
}
