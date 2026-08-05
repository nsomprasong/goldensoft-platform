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

  const [staff, platformRoles, invitationsSendEnabled, memberships] = await Promise.all([
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
            title="จัดการสิทธิ์พนักงาน Platform"
            description="แยกสิทธิ์ระดับแพลตฟอร์มออกจากสิทธิ์ภายในแต่ละองค์กรอย่างชัดเจน"
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-[var(--radius-lg)] border border-[var(--info-border)] bg-[var(--info-soft)] p-4">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--info)]">Platform scope</p>
                <h3 className="mt-1 font-semibold text-[var(--text-primary)]">สิทธิ์ระดับแพลตฟอร์ม</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">ใช้จัดการระบบกลาง องค์กร ผลิตภัณฑ์ การเรียกเก็บเงิน และพนักงาน GoldenSoft</p>
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
                      <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{option?.permissionLabels.length ? option.permissionLabels.join(" · ") : "ยังไม่มีสิทธิ์ระดับแพลตฟอร์ม"}</p>
                    </li>
                  );
                })}
              </ul>
              <PlatformRoleAssignForm userProfileId={staff.id} roles={platformRoleOptions} assignedRoleIds={staff.roles.map((role) => role.roleId)} />
            </section>

            <section className="rounded-[var(--radius-lg)] border border-[var(--success-border)] bg-[var(--success-soft)] p-4">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--success)]">Organization scope</p>
                <h3 className="mt-1 font-semibold text-[var(--text-primary)]">สิทธิ์ภายในองค์กร</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">มีผลเฉพาะองค์กรที่ระบุ ไม่ให้สิทธิ์จัดการ Platform และไม่ข้ามไปยังองค์กรอื่น</p>
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
                                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{labels.length ? labels.join(" · ") : "บทบาทนี้ยังไม่ได้กำหนดสิทธิ์ภายในองค์กร"}</p>
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
