import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil, Plus, Shield } from "lucide-react";

import { CustomRoleForm } from "@/components/custom-role-form";
import { PlatformShell } from "@/components/platform-shell";
import { RoleManagementSubmenu } from "@/components/role-management-submenu";
import { RolePositionsPanel } from "@/components/role-positions-panel";
import { AccessDenied, PageHeader, SectionHeader } from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { TH, labelRole } from "@/lib/i18n/th";
import { PLATFORM_PERMISSIONS, permissionSupportsScope } from "@/lib/permissions/codes";
import { loadPermissionRegistry } from "@/lib/permissions/registry";
import { displayPermissionCodesForRole, resolveActorPermissionCodes } from "@/lib/platform/custom-roles";
import { isGoldenSoftCustomerCode } from "@/lib/platform/bootstrap-organization";
import { MASTER } from "@/lib/platform/master-codes";
import { displayPermissionCodesForPlatformRole } from "@/lib/platform/platform-roles";
import { organizationRoleAssignmentWhere } from "@/lib/platform/role-assignee-scope";
import { prisma } from "@/lib/prisma";

import styles from "./roles.module.css";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    context?: string;
    organizationId?: string;
    scope?: string;
    roleId?: string;
    action?: string;
  }>;
};

export default async function RolesPage({ searchParams }: Props) {
  const ctx = await requirePlatformPage();
  const query = await searchParams;
  const organizationId = ctx.activeOrganization?.id ?? null;
  const requestedOrganizationId = query.organizationId ?? organizationId;

  // The Customer App opens this workspace with an explicit organizationId.
  // Reconcile a stale/shared context cookie before rendering so navigation does
  // not silently fall back to GoldenSoft or a previously selected customer.
  if (query.organizationId && query.organizationId !== organizationId) {
    const mode = ctx.bundle.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)
      ? "platform_admin"
      : ctx.managedOrganizationIds.includes(query.organizationId)
        ? "managed_org"
        : "membership";
    const nextParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) nextParams.set(key, value);
    }
    const bootstrapParams = new URLSearchParams({
      organizationId: query.organizationId,
      mode,
      next: `/roles?${nextParams.toString()}`,
    });
    redirect(`/api/platform/context/bootstrap?${bootstrapParams.toString()}`);
  }
  const platformContext =
    ctx.contextMode === "platform_admin" &&
    isGoldenSoftCustomerCode(ctx.activeOrganization?.customerCode);
  const platformPermissionCodes = await resolveActorPermissionCodes(prisma, {
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: [],
  });
  const isPlatformManager = platformPermissionCodes.includes(PLATFORM_PERMISSIONS.roleManage);
  const contextAllowed =
    requestedOrganizationId === organizationId &&
    (!platformContext ||
      (isPlatformManager &&
        isGoldenSoftCustomerCode(ctx.activeOrganization?.customerCode)));
  const canRead = ctx.permissionCodes.includes(PLATFORM_PERMISSIONS.roleRead);
  const canManage = ctx.permissionCodes.includes(PLATFORM_PERMISSIONS.roleManage);
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

  if (!organizationId || !contextAllowed || !canRead) {
    return <PlatformShell {...shellProps}><AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} /></PlatformShell>;
  }

  const scope = platformContext ? "platform" : "organization";
  const organizationAssignmentWhere = organizationRoleAssignmentWhere({
    organizationId,
    activeBranchId: ctx.activeBranch?.id,
  });
  const [organizationRoles, organizationPermissions, organizationRoleOverrides] = await Promise.all([
    prisma.organizationRole.findMany({
      where: { OR: [{ organizationId: null, isSystem: true }, { organizationId }] },
      orderBy: [{ isSystem: "desc" }, { isActive: "desc" }, { sortOrder: "asc" }],
      include: {
        permissions: { where: { revokedAt: null, permission: { is: { isActive: true } } }, include: { permission: true } },
        _count: {
          select: { assignments: { where: organizationAssignmentWhere } },
        },
      },
    }),
    loadPermissionRegistry(prisma, { organizationId }),
    prisma.organizationRoleOverride.findMany({
      where: { organizationId },
      select: {
        standardRoleId: true,
        nameTh: true,
        nameEn: true,
        description: true,
        permissionCodes: true,
      },
    }),
  ]);
  const overrideByRoleId = new Map(
    organizationRoleOverrides.map((override) => [override.standardRoleId, override]),
  );
  const platformRoles = platformContext
    ? await prisma.platformRole.findMany({
        orderBy: { sortOrder: "asc" },
        include: {
          permissions: { where: { revokedAt: null, permission: { is: { isActive: true } } }, include: { permission: true } },
          _count: { select: { assignments: { where: { revokedAt: null } } } },
        },
      })
    : [];
  const positionCountRows = await prisma.$queryRaw<Array<{ role_id: string; count: bigint }>>`
    SELECT pr.organization_role_id::text AS role_id, COUNT(*)::bigint AS count
    FROM hr.position_roles pr
    JOIN hr.positions p ON p.id = pr.position_id
    WHERE p.organization_id = ${organizationId}::uuid
      AND (${ctx.activeBranch?.id ?? null}::uuid IS NULL OR p.branch_id IS NULL OR p.branch_id = ${ctx.activeBranch?.id ?? null}::uuid)
    GROUP BY pr.organization_role_id
  `;
  const positionCounts = new Map(
    positionCountRows.map((row) => [row.role_id, Number(row.count)]),
  );
  const platformPermissions = platformContext
    ? await loadPermissionRegistry(prisma, { platform: true })
    : [];
  for (const role of organizationRoles) {
    role.permissions = role.permissions.filter((row) =>
      permissionSupportsScope(row.permission.code, "organization"),
    );
  }
  const contextKey = [
    platformContext ? "PLATFORM_CONTEXT" : "ORGANIZATION_CONTEXT",
    organizationId,
    ctx.activeBranch?.id ?? "ALL_BRANCHES",
    scope,
    organizationPermissions.map((permission) => permission.productCode).sort().join(","),
  ].join(":");
  const selectedPlatformRole = scope === "platform"
    ? platformRoles.find((role) => role.id === query.roleId) ?? null
    : null;
  const selectedOrganizationRole = scope === "organization"
    ? organizationRoles.find((role) => role.id === query.roleId) ?? null
    : null;
  const selectedRoleId = selectedPlatformRole?.id ?? selectedOrganizationRole?.id ?? null;
  const recentAuditLogs = selectedRoleId
    ? await prisma.auditLog.findMany({
        where: {
          entityId: selectedRoleId,
          ...(scope === "platform" ? { organizationId: null } : { organizationId }),
        },
        include: { actionType: { select: { nameTh: true, code: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
    : [];
  const creatingOrganizationRole = query.action === "new" && scope === "organization";
  const creatingPlatformRole =
    platformContext && query.action === "new" && scope === "platform";
  return (
    <PlatformShell {...shellProps}>
      <PageHeader title="จัดการบทบาทและสิทธิ์" description="เลือกบทบาทด้านซ้าย แล้วจัดการข้อมูล สิทธิ์ และผู้ใช้งานในพื้นที่เดียว" icon={<Shield size={24} />} />
      <div id="role-workspace" className="grid scroll-mt-24 items-start gap-4 pb-24 xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <aside className="card grid gap-3 xl:sticky xl:top-[calc(var(--header-height)+1rem)]" aria-label="รายการบทบาท">
          <SectionHeader
            title={platformContext ? "บทบาทระดับแพลตฟอร์ม" : `บทบาทภายในองค์กร ${ctx.activeOrganization?.name ?? ""}`}
            description={platformContext ? "บทบาทของทีม GoldenSoft" : "บทบาทมาตรฐานและบทบาทที่องค์กรสร้าง"}
          />
          {(platformContext ? isPlatformManager : canManage) ? (
            <IconTextLink
              href={platformContext
                ? `/roles?context=platform&organizationId=${organizationId}&action=new`
                : `/roles?context=organization&organizationId=${organizationId}&action=new`}
              label={platformContext ? "เพิ่มบทบาทแพลตฟอร์ม" : "เพิ่มบทบาทองค์กร"}
              icon={<Plus className="size-4" />}
            />
          ) : null}
          <ul className="grid gap-2">
            {(platformContext ? platformRoles : organizationRoles).map((role) => {
              const selected = role.id === selectedRoleId;
              const roleOverride = "organizationId" in role ? overrideByRoleId.get(role.id) : undefined;
              const displayName = roleOverride?.nameTh || role.nameTh || labelRole(role.code);
              const href = `/roles?context=${platformContext ? "platform" : "organization"}&organizationId=${organizationId}&roleId=${role.id}`;
              return (
                <li key={role.id}>
                  <div className={`${styles.roleCard} ${selected ? styles.roleCardSelected : ""}`}>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{displayName}</span>
                      <span className="mt-1 block text-[length:var(--text-caption)] text-[var(--text-muted)]">
                        {platformContext
                          ? `ผู้ใช้งาน ${role._count.assignments} คน · สิทธิ์ ${role.permissions.length} รายการ`
                          : `${role.isSystem ? "มาตรฐาน" : "องค์กรสร้าง"} · ตำแหน่ง ${positionCounts.get(role.id) ?? 0} · ผู้ใช้งาน ${role._count.assignments}`}
                      </span>
                      <span className={`mt-1 inline-flex text-[length:var(--text-caption)] font-medium ${role.isActive ? "text-[var(--success)]" : "text-[var(--text-muted)]"}`}>
                        {role.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                      </span>
                    </span>
                    <Link
                      href={`${href}#role-editor`}
                      aria-label={`แก้ไขบทบาท ${displayName}`}
                      title="แก้ไขบทบาท"
                      className="nav-icon-idle-organization inline-flex size-10 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>

        <main id="role-editor" className="grid min-w-0 scroll-mt-24 gap-4" aria-label="พื้นที่จัดการบทบาท">
          {(creatingOrganizationRole && canManage) ? (
            <CustomRoleForm key={`${contextKey}:new`} mode="create" organizationId={organizationId} permissionCatalog={organizationPermissions} returnPath={`/roles?context=organization&organizationId=${organizationId}`} />
          ) : null}
          {(creatingPlatformRole && isPlatformManager) ? (
            <CustomRoleForm key={`${contextKey}:new-platform`} mode="create" roleKind="platform" organizationId={null} permissionCatalog={platformPermissions} customerSupportPermissionCatalog={organizationPermissions} returnPath={`/roles?context=platform&organizationId=${organizationId}`} />
          ) : null}
          {selectedOrganizationRole ? (
            <>
              <CustomRoleForm
                key={`${contextKey}:${selectedOrganizationRole.id}`}
                mode="edit"
                roleId={selectedOrganizationRole.id}
                organizationId={organizationId}
                allowSystemPermissionEdit={canManage}
                hasOrganizationOverride={overrideByRoleId.has(selectedOrganizationRole.id)}
                permissionCatalog={organizationPermissions}
                returnPath={`/roles?context=organization&organizationId=${organizationId}`}
                initial={{ code: selectedOrganizationRole.code, nameTh: overrideByRoleId.get(selectedOrganizationRole.id)?.nameTh ?? selectedOrganizationRole.nameTh, nameEn: overrideByRoleId.get(selectedOrganizationRole.id)?.nameEn ?? selectedOrganizationRole.nameEn, description: overrideByRoleId.get(selectedOrganizationRole.id)?.description ?? selectedOrganizationRole.description ?? "", permissionCodes: displayPermissionCodesForRole({ isSystem: selectedOrganizationRole.isSystem, code: selectedOrganizationRole.code, dbPermissionCodes: overrideByRoleId.get(selectedOrganizationRole.id)?.permissionCodes ?? selectedOrganizationRole.permissions.map((row) => row.permission.code) }).filter((code) => organizationPermissions.some((permission) => permission.code === code)), isSystem: selectedOrganizationRole.isSystem, isActive: selectedOrganizationRole.isActive }}
              />
              {!selectedOrganizationRole.isSystem ? <RolePositionsPanel roleId={selectedOrganizationRole.id} organizationId={organizationId} branches={ctx.branches.map((branch) => ({ id: branch.id, name: branch.name }))} /> : null}
            </>
          ) : null}
          {selectedPlatformRole ? (
            <>
              <CustomRoleForm key={`${contextKey}:${selectedPlatformRole.id}`} mode="edit" roleKind="platform" roleId={selectedPlatformRole.id} organizationId={null} allowSystemPermissionEdit={selectedPlatformRole.code !== MASTER.platformRole.SUPER_ADMIN} lockPermissions={selectedPlatformRole.code === MASTER.platformRole.SUPER_ADMIN} permissionCatalog={platformPermissions} customerSupportPermissionCatalog={organizationPermissions} returnPath={`/roles?context=platform&organizationId=${organizationId}`} initial={{ code: selectedPlatformRole.code, nameTh: selectedPlatformRole.nameTh, nameEn: selectedPlatformRole.nameEn, description: selectedPlatformRole.description ?? "", permissionCodes: displayPermissionCodesForPlatformRole({ code: selectedPlatformRole.code, dbPermissionCodes: selectedPlatformRole.permissions.map((row) => row.permission.code) }).filter((code) => [...platformPermissions, ...organizationPermissions].some((permission) => permission.code === code)), isSystem: selectedPlatformRole.isSystem, isActive: selectedPlatformRole.isActive }} />
            </>
          ) : null}
          {!selectedRoleId && !creatingOrganizationRole && !creatingPlatformRole ? (
            <section className="card grid min-h-40 place-content-center gap-1 text-center">
              <h2 className="font-semibold">เลือกบทบาทเพื่อจัดการ</h2>
              <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">รายละเอียดและเครื่องมือจัดการจะแสดงที่นี่</p>
            </section>
          ) : null}
          {selectedRoleId ? (
            <section className="card grid gap-3">
              <SectionHeader title="ประวัติการเปลี่ยนแปลง" description="รายการล่าสุดของบทบาทนี้" />
              {recentAuditLogs.length > 0 ? (
                <ul className="grid gap-2 text-[length:var(--text-helper)]">
                  {recentAuditLogs.map((log) => (
                    <li key={log.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                      {log.actionType.nameTh || log.actionType.code} · {new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(log.createdAt)}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[var(--text-muted)]">ยังไม่มีประวัติการเปลี่ยนแปลงในขอบเขตนี้</p>}
            </section>
          ) : null}
        </main>
      </div>
      <RoleManagementSubmenu active="roles" organizationId={organizationId} platformContext={platformContext} />
    </PlatformShell>
  );
}
