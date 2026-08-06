import { ArrowLeft, BadgeCheck } from "lucide-react";

import { PlatformShell } from "@/components/platform-shell";
import {
  PlatformRoleAssignForm,
  PlatformRoleRevokeButton,
} from "@/components/platform-role-form";
import {
  MembershipRoleAssignForm,
  RoleRevokeButton,
} from "@/components/membership-role-form";
import { StaffEditForm } from "@/components/staff-edit-form";
import { StaffInviteButton } from "@/components/staff-invite-button";
import { StaffPasswordResetButton } from "@/components/staff-password-reset-button";
import {
  StaffPortfolioAssignForm,
  StaffPortfolioRevokeButton,
} from "@/components/staff-portfolio-form";
import {
  AccessDenied,
  PageHeader,
  SectionHeader,
} from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { labelRole, TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSION_LABELS,
  defaultPermissionsForOrganizationRole,
  defaultPermissionsForPlatformRole,
  type PlatformPermission,
} from "@/lib/permissions/codes";
import { listOrganizationRoles } from "@/lib/platform/custom-roles";
import {
  canManagePortfolioAssignments,
  listStaffOrganizationAssignments,
} from "@/lib/platform/customer-portfolio";
import { resolveEffectivePermissionCodes } from "@/lib/permissions/effective";
import {
  canManageStaff,
  canResetUserPassword,
  getStaffMember,
} from "@/lib/platform/staff";
import { isInvitationSendEnabled } from "@/lib/platform/system-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePlatformPage();
  const actor = { platformRoles: ctx.bundle.platformRoles };
  const shellProps = {
    displayName: ctx.bundle.profile?.displayName ?? TH.common.user,
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: membershipOrganizationOptions(ctx.bundle),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
    pageTitle: TH.staff.edit,
    contextMode: ctx.contextMode,
    canUseManagedOrgMode: ctx.managedOrganizationIds.length > 0,
  };

  if (!canManageStaff(actor)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const [
    staff,
    platformRoles,
    invitationsSendEnabled,
    memberships,
    customerAssignments,
    customerOrganizations,
    actorPermissionCodes,
  ] = await Promise.all([
    getStaffMember(prisma, id),
    prisma.platformRole.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        code: true,
        nameTh: true,
        permissions: {
          where: { revokedAt: null, permission: { is: { isActive: true } } },
          select: { permission: { select: { code: true, nameTh: true } } },
        },
      },
    }),
    isInvitationSendEnabled(prisma),
    prisma.organizationMembership.findMany({
      where: {
        userProfileId: id,
        endedAt: null,
        status: { code: MASTER.membershipStatus.ACTIVE },
      },
      select: {
        id: true,
        organizationId: true,
        organization: { select: { displayName: true } },
        roles: {
          where: {
            revokedAt: null,
            status: { code: MASTER.assignmentStatus.ACTIVE },
          },
          select: {
            id: true,
            roleId: true,
            role: {
              select: {
                code: true,
                nameTh: true,
                permissions: {
                  where: { revokedAt: null, permission: { is: { isActive: true } } },
                  select: { permission: { select: { code: true, nameTh: true } } },
                },
              },
            },
          },
          orderBy: { assignedAt: "asc" },
        },
      },
      orderBy: { organization: { displayName: "asc" } },
    }),
    listStaffOrganizationAssignments(prisma, { staffUserProfileId: id }),
    prisma.organization.findMany({
      where: {
        deletedAt: null,
        status: { code: MASTER.organizationStatus.ACTIVE },
        NOT: { customerCode: "GOLDENSOFT" },
      },
      select: { id: true, displayName: true, customerCode: true },
      orderBy: { displayName: "asc" },
      take: 500,
    }),
    resolveEffectivePermissionCodes(prisma, ctx.user.id, null),
  ]);

  if (!staff) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.common.notFound} body={TH.common.notFound} />
      </PlatformShell>
    );
  }

  const organizationRoleCatalogs = await Promise.all(
    memberships.map(async (membership) => ({
      membershipId: membership.id,
      roles: await listOrganizationRoles(prisma, membership.organizationId),
    })),
  );
  const organizationRolesByMembership = new Map(
    organizationRoleCatalogs.map((catalog) => [catalog.membershipId, catalog.roles]),
  );
  const platformRoleOptions = platformRoles.map((role) => {
    const assignedPermissions = role.permissions.map((row) => ({
      code: row.permission.code,
      label: row.permission.nameTh,
    }));
    const permissions = assignedPermissions.length
      ? assignedPermissions
      : defaultPermissionsForPlatformRole(role.code).map((code) => ({
          code,
          label: PLATFORM_PERMISSION_LABELS[code as PlatformPermission] ?? code,
        }));
    return {
      id: role.id,
      code: role.code,
      nameTh: role.nameTh,
      permissionLabels: permissions.map((permission) => permission.label),
    };
  });
  const activeCustomerAssignments = customerAssignments.filter(
    (assignment) => !assignment.revokedAt,
  );
  const assignedCustomerOrganizationIds = new Set(
    activeCustomerAssignments.map((assignment) => assignment.organizationId),
  );
  const customerOrganizationOptions = customerOrganizations
    .filter((organization) => !assignedCustomerOrganizationIds.has(organization.id))
    .map((organization) => ({
      id: organization.id,
      label: `${organization.displayName} (${organization.customerCode})`,
    }));
  const canManageCustomerAssignments = canManagePortfolioAssignments({
    platformRoles: ctx.bundle.platformRoles,
    permissionCodes: actorPermissionCodes,
  });
  const isCustomerPortfolioStaff = staff.roles.some(
    (role) =>
      role.code === MASTER.platformRole.SALES ||
      role.code === MASTER.platformRole.ACCOUNT_MANAGER,
  );

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={TH.staff.edit}
        description={staff.email}
        actions={
          <IconTextLink
            href="/staff"
            variant="outline"
            label={TH.common.back}
            icon={<ArrowLeft className="size-5" />}
          />
        }
      />

      <div className="grid gap-4">
        <section className="card max-w-2xl">
          <SectionHeader title={TH.staff.editTitle} />
          <StaffEditForm
            userProfileId={staff.id}
            initial={{
              email: staff.email,
              statusCode: staff.statusCode,
              identity: staff.identity
                ? {
                    titleCode: staff.identity.titleCode,
                    firstNameTh: staff.identity.firstNameTh,
                    lastNameTh: staff.identity.lastNameTh,
                    nationalId: staff.identity.nationalId ?? "",
                    dateOfBirth: staff.identity.dateOfBirth,
                    addressLine: staff.identity.addressLine ?? "",
                    phone: staff.identity.phone ?? "",
                  }
                : null,
            }}
          />
        </section>

        <section className="card">
          <SectionHeader
            title="บทบาทและการเข้าถึง"
            description="กำหนดบทบาท Platform และองค์กรลูกค้าที่พนักงานรับผิดชอบ"
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-[var(--radius-lg)] border border-[var(--info-border)] bg-[var(--info-soft)] p-4">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--info)]">Platform</p>
                <h3 className="mt-1 font-semibold text-[var(--text-primary)]">บทบาทแพลตฟอร์ม</h3>
              </div>
              <ul className="mb-4 grid gap-2">
                {staff.roles.map((role) => {
                  const option = platformRoleOptions.find((item) => item.id === role.roleId);
                  return (
                    <li key={role.assignmentId} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><BadgeCheck size={14} aria-hidden="true" />{labelRole(role.code)}</span>
                        {role.code !== MASTER.platformRole.SUPER_ADMIN ? <PlatformRoleRevokeButton assignmentId={role.assignmentId} /> : null}
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{option?.permissionLabels.length ?? 0} สิทธิ์</p>
                    </li>
                  );
                })}
              </ul>
              <PlatformRoleAssignForm userProfileId={staff.id} roles={platformRoleOptions} assignedRoleIds={staff.roles.map((role) => role.roleId)} />
            </section>

            <section className="rounded-[var(--radius-lg)] border border-[var(--warning-border)] bg-[var(--warning-soft)] p-4 xl:col-span-2 xl:row-start-2">
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--warning)]">Customer access</p>
                <h3 className="mt-1 font-semibold text-[var(--text-primary)]">องค์กรลูกค้าที่รับผิดชอบ</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">ใช้สำหรับ SALES หรือ ACCOUNT_MANAGER เพื่อเปิดดูองค์กรลูกค้าที่ได้รับมอบหมาย</p>
              </div>
              {activeCustomerAssignments.length ? (
                <ul className="mb-3 grid gap-2 sm:grid-cols-2">
                  {activeCustomerAssignments.map((assignment) => (
                    <li key={assignment.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[var(--text-primary)]">{assignment.organization.displayName}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{assignment.assignmentRole?.nameTh ?? "ผู้รับผิดชอบ"} · {assignment.scopeType?.nameTh ?? "ทุกสาขา"}</p>
                      </div>
                      {canManageCustomerAssignments ? <StaffPortfolioRevokeButton assignmentId={assignment.id} /> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-3 text-sm text-[var(--text-secondary)]">ยังไม่ได้รับมอบหมายองค์กรลูกค้า</p>
              )}
              {!isCustomerPortfolioStaff ? (
                <p className="text-sm text-[var(--warning)]">กำหนดบทบาท SALES หรือ ACCOUNT_MANAGER ก่อนมอบหมายองค์กรลูกค้า</p>
              ) : null}
              {canManageCustomerAssignments && isCustomerPortfolioStaff && customerOrganizationOptions.length ? (
                <StaffPortfolioAssignForm
                  fixedStaffUserProfileId={staff.id}
                  staffOptions={[]}
                  organizationOptions={customerOrganizationOptions}
                />
              ) : null}
            </section>

            <section className="rounded-[var(--radius-lg)] border border-[var(--success-border)] bg-[var(--success-soft)] p-4 xl:col-start-2 xl:row-start-1">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--success)]">Organization</p>
                <h3 className="mt-1 font-semibold text-[var(--text-primary)]">บทบาทสมาชิกองค์กร</h3>
              </div>
              {memberships.length === 0 ? (
                <p className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3 text-sm text-[var(--text-secondary)]">พนักงานคนนี้ยังไม่ได้เป็นสมาชิกขององค์กร</p>
              ) : (
                <div className="grid gap-3">
                  {memberships.map((membership) => {
                    const assignedIds = new Set(membership.roles.map((assignment) => assignment.roleId));
                    const catalog = organizationRolesByMembership.get(membership.id) ?? [];
                    const availableRoles = catalog
                      .filter((role) => role.isActive && !assignedIds.has(role.id))
                      .map((role) => {
                        const linked = role.permissions.map((row) => row.permission.nameTh || row.permission.code);
                        const fallback = defaultPermissionsForOrganizationRole(role.code).map((code) => PLATFORM_PERMISSION_LABELS[code]);
                        return { id: role.id, code: role.code, nameTh: role.nameTh, isSystem: role.isSystem, permissionLabels: linked.length ? linked : fallback };
                      });
                    return (
                      <article key={membership.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
                        <h4 className="font-semibold text-[var(--text-primary)]">{membership.organization.displayName}</h4>
                        <ul className="my-3 grid gap-2">
                          {membership.roles.map((assignment) => {
                            const linked = assignment.role.permissions.map((row) => row.permission.nameTh || row.permission.code);
                            const fallback = defaultPermissionsForOrganizationRole(assignment.role.code).map((code) => PLATFORM_PERMISSION_LABELS[code]);
                            const labels = linked.length ? linked : fallback;
                            return (
                              <li key={assignment.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-sm font-semibold"><BadgeCheck size={14} aria-hidden="true" />{assignment.role.nameTh}</span><RoleRevokeButton assignmentId={assignment.id} /></div>
                                <p className="mt-1 text-xs text-[var(--text-secondary)]">{labels.length} สิทธิ์</p>
                              </li>
                            );
                          })}
                        </ul>
                        {availableRoles.length ? <MembershipRoleAssignForm membershipId={membership.id} roles={availableRoles} plain /> : <p className="text-sm text-[var(--text-secondary)]">ได้รับบทบาทที่ใช้ได้ในองค์กรนี้ครบแล้ว</p>}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </section>

        {invitationsSendEnabled || canResetUserPassword(actor) ? (
          <section className="card max-w-2xl">
            <SectionHeader
              title={TH.staff.accessActions}
              description={
                staff.openPasswordReset
                  ? `${TH.staff.passwordResetPendingUntil} ${staff.openPasswordReset.expiresAt.toLocaleString("th-TH")}`
                  : TH.staff.accessActionsBody
              }
            />
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label={TH.staff.accessActions}
            >
              {invitationsSendEnabled ? (
                <StaffInviteButton
                  userProfileId={staff.id}
                  layout="text"
                />
              ) : null}
              {canResetUserPassword(actor) ? (
                <StaffPasswordResetButton
                  userProfileId={staff.id}
                  openResetId={staff.openPasswordReset?.id ?? null}
                  layout="text"
                />
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </PlatformShell>
  );
}
