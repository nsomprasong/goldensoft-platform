import Link from "next/link";
import { Plus, Shield } from "lucide-react";

import { CustomRoleForm } from "@/components/custom-role-form";
import { CustomerAssignmentPanel } from "@/components/customer-assignment-panel";
import { PlatformShell } from "@/components/platform-shell";
import { RoleAssignmentPanel } from "@/components/role-assignment-panel";
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
import { prisma } from "@/lib/prisma";

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
  const platformContext = query.context === "platform";
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

  const scope = platformContext && query.scope === "platform" ? "platform" : "organization";
  const [organizationRoles, organizationPermissions, memberships] = await Promise.all([
    prisma.organizationRole.findMany({
      where: { OR: [{ organizationId: null, isSystem: true }, { organizationId }] },
      orderBy: [{ isSystem: "desc" }, { isActive: "desc" }, { sortOrder: "asc" }],
      include: {
        permissions: { where: { revokedAt: null, permission: { is: { isActive: true } } }, include: { permission: true } },
        _count: { select: { assignments: { where: { revokedAt: null } } } },
      },
    }),
    loadPermissionRegistry(prisma, { organizationId }),
    prisma.organizationMembership.findMany({
      where: {
        organizationId,
        endedAt: null,
        status: { code: MASTER.membershipStatus.ACTIVE },
      },
      select: { id: true, userProfile: { select: { displayName: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
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
  const platformAssignees = platformContext
    ? await prisma.userProfile.findMany({
        where: {
          deletedAt: null,
          memberships: {
            some: {
              organization: { customerCode: "GOLDENSOFT" },
              endedAt: null,
              status: { code: MASTER.membershipStatus.ACTIVE },
            },
          },
        },
        select: { id: true, displayName: true, email: true },
        orderBy: { displayName: "asc" },
      })
    : [];
  const customerAssignments = platformContext
    ? await prisma.staffOrganizationAssignment.findMany({
        where: { organizationId, revokedAt: null },
        include: { staffUserProfile: { select: { id: true, displayName: true, email: true } } },
        orderBy: { assignedAt: "asc" },
      })
    : [];
  const canManageCustomerAssignments =
    platformPermissionCodes.includes(PLATFORM_PERMISSIONS.customerAssignmentManage) ||
    platformPermissionCodes.includes(PLATFORM_PERMISSIONS.customerPortfolioManage);
  const canTransferCustomerAssignments = platformPermissionCodes.includes(
    PLATFORM_PERMISSIONS.customerAssignmentTransfer,
  );

  const contextQuery = new URLSearchParams({ organizationId });
  return (
    <PlatformShell {...shellProps}>
      <PageHeader title="จัดการบทบาทและสิทธิ์" description="บทบาทระดับแพลตฟอร์มใช้สำหรับทีม GoldenSoft ส่วนบทบาทภายในองค์กรใช้กำหนดสิทธิ์ของผู้ใช้งานและพนักงานในองค์กรที่เลือก" icon={<Shield size={24} />} />
      <div className="mb-5 flex flex-wrap gap-2">
        {isPlatformManager ? <IconTextLink href={`/roles?context=platform&${contextQuery}`} label="มุมมองแพลตฟอร์ม" /> : null}
        <IconTextLink href={`/roles?context=organization&${contextQuery}`} label="มุมมององค์กร" variant="outline" />
      </div>

      {platformContext ? (
        <section className="card mb-5 space-y-4">
          <SectionHeader title="บทบาทระดับแพลตฟอร์ม" description="Platform Role และ Platform Role Assignment ของทีม GoldenSoft เท่านั้น" />
          <IconTextLink href={`/roles?context=platform&organizationId=${organizationId}&scope=platform&action=new`} label="เพิ่มบทบาทระดับแพลตฟอร์ม" icon={<Plus className="size-4" />} />
          <ul className="grid gap-2 md:grid-cols-2">
            {platformRoles.map((role) => (
              <li key={role.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] p-3">
                <Link href={`/roles?context=platform&organizationId=${organizationId}&scope=platform&roleId=${role.id}`} className="font-semibold">{role.nameTh || labelRole(role.code)}</Link>
                <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">ผู้ใช้งาน {role._count.assignments} คน · สิทธิ์ {role.permissions.length} รายการ · {role.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card mb-5 space-y-4">
        <SectionHeader title={`บทบาทภายในองค์กร ${ctx.activeOrganization?.name ?? ""}`} description="บทบาทมาตรฐานและบทบาทที่องค์กรนี้สร้างเองเท่านั้น" />
        {canManage ? <IconTextLink href={`/roles?context=${platformContext ? "platform" : "organization"}&organizationId=${organizationId}&scope=organization&action=new`} label="เพิ่มบทบาท" icon={<Plus className="size-4" />} /> : null}
        <ul className="grid gap-2 md:grid-cols-2">
          {organizationRoles.map((role) => (
            <li key={role.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] p-3">
              <Link href={`/roles?context=${platformContext ? "platform" : "organization"}&organizationId=${organizationId}&scope=organization&roleId=${role.id}`} className="font-semibold">{role.nameTh || labelRole(role.code)}</Link>
              <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{role.isSystem ? "บทบาทมาตรฐาน" : "บทบาทที่องค์กรสร้าง"} · ตำแหน่ง {positionCounts.get(role.id) ?? 0} ตำแหน่ง · ผู้ใช้งาน {role._count.assignments} คน · สิทธิ์ {role.permissions.length} รายการ</p>
            </li>
          ))}
        </ul>
      </section>

      {platformContext ? (
        <CustomerAssignmentPanel
          organizationId={organizationId}
          organizationName={ctx.activeOrganization?.name ?? "องค์กรที่เลือก"}
          staffOptions={platformAssignees.map((profile) => ({ id: profile.id, label: `${profile.displayName} · ${profile.email}` }))}
          assignments={customerAssignments.map((assignment) => ({
            id: assignment.id,
            staffUserProfileId: assignment.staffUserProfileId,
            staffLabel: `${assignment.staffUserProfile.displayName} · ${assignment.staffUserProfile.email}`,
            note: assignment.note,
          }))}
          canManage={canManageCustomerAssignments}
          canTransfer={canTransferCustomerAssignments}
        />
      ) : null}

      {creatingOrganizationRole && canManage ? (
        <CustomRoleForm key={`${contextKey}:new`} mode="create" organizationId={organizationId} permissionCatalog={organizationPermissions} returnPath={`/roles?context=${platformContext ? "platform" : "organization"}&organizationId=${organizationId}`} />
      ) : null}
      {creatingPlatformRole && isPlatformManager ? (
        <CustomRoleForm key={`${contextKey}:new-platform`} mode="create" roleKind="platform" organizationId={null} permissionCatalog={platformPermissions} customerSupportPermissionCatalog={organizationPermissions} returnPath={`/roles?context=platform&organizationId=${organizationId}`} />
      ) : null}
      {selectedOrganizationRole ? (
        <div className="grid gap-4">
          <CustomRoleForm
            key={`${contextKey}:${selectedOrganizationRole.id}`}
            mode="edit"
            roleId={selectedOrganizationRole.id}
            organizationId={organizationId}
            allowSystemPermissionEdit={false}
            permissionCatalog={organizationPermissions}
            returnPath={`/roles?context=${platformContext ? "platform" : "organization"}&organizationId=${organizationId}`}
            initial={{ code: selectedOrganizationRole.code, nameTh: selectedOrganizationRole.nameTh, nameEn: selectedOrganizationRole.nameEn, description: selectedOrganizationRole.description ?? "", permissionCodes: displayPermissionCodesForRole({ isSystem: selectedOrganizationRole.isSystem, code: selectedOrganizationRole.code, dbPermissionCodes: selectedOrganizationRole.permissions.map((row) => row.permission.code) }).filter((code) => organizationPermissions.some((permission) => permission.code === code)), isSystem: selectedOrganizationRole.isSystem, isActive: selectedOrganizationRole.isActive }}
          />
          {!selectedOrganizationRole.isSystem ? <RolePositionsPanel roleId={selectedOrganizationRole.id} organizationId={organizationId} branches={ctx.branches.map((branch) => ({ id: branch.id, name: branch.name }))} /> : null}
          <RoleAssignmentPanel key={`${contextKey}:assignment:${selectedOrganizationRole.id}`} scope="organization" roleId={selectedOrganizationRole.id} assignees={memberships.map((membership) => ({ id: membership.id, label: `${membership.userProfile.displayName} · ${membership.userProfile.email}` }))} />
        </div>
      ) : null}
      {selectedPlatformRole ? (
        <div className="grid gap-4">
          <CustomRoleForm key={`${contextKey}:${selectedPlatformRole.id}`} mode="edit" roleKind="platform" roleId={selectedPlatformRole.id} organizationId={null} allowSystemPermissionEdit={selectedPlatformRole.code !== MASTER.platformRole.SUPER_ADMIN} lockPermissions={selectedPlatformRole.code === MASTER.platformRole.SUPER_ADMIN} permissionCatalog={platformPermissions} customerSupportPermissionCatalog={organizationPermissions} returnPath={`/roles?context=platform&organizationId=${organizationId}`} initial={{ code: selectedPlatformRole.code, nameTh: selectedPlatformRole.nameTh, nameEn: selectedPlatformRole.nameEn, description: selectedPlatformRole.description ?? "", permissionCodes: displayPermissionCodesForPlatformRole({ code: selectedPlatformRole.code, dbPermissionCodes: selectedPlatformRole.permissions.map((row) => row.permission.code) }).filter((code) => [...platformPermissions, ...organizationPermissions].some((permission) => permission.code === code)), isSystem: selectedPlatformRole.isSystem, isActive: selectedPlatformRole.isActive }} />
          <RoleAssignmentPanel key={`${contextKey}:assignment:${selectedPlatformRole.id}`} scope="platform" roleId={selectedPlatformRole.id} assignees={platformAssignees.map((profile) => ({ id: profile.id, label: `${profile.displayName} · ${profile.email}` }))} />
        </div>
      ) : null}
      {selectedRoleId ? (
        <section className="card mt-4 grid gap-3">
          <SectionHeader title="ประวัติการเปลี่ยนแปลง" description="Audit Log ของบทบาทในขอบเขตปัจจุบัน" />
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
    </PlatformShell>
  );
}
