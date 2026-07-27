import { ArrowLeft, BadgeCheck } from "lucide-react";

import { PlatformShell } from "@/components/platform-shell";
import {
  PlatformRoleAssignForm,
  PlatformRoleRevokeButton,
} from "@/components/platform-role-form";
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
import { labelRole, TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
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
    organizations: ctx.bundle.memberships.map((m) => ({
      id: m.organizationId,
      name: m.organizationName,
    })),
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

  const [staff, platformRoles, invitationsSendEnabled] = await Promise.all([
    getStaffMember(prisma, id),
    prisma.platformRole.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, nameTh: true },
    }),
    isInvitationSendEnabled(prisma),
  ]);

  if (!staff) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.common.notFound} body={TH.common.notFound} />
      </PlatformShell>
    );
  }

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

        <section className="card max-w-2xl">
          <SectionHeader
            title={TH.staff.manageRoles}
            description={TH.staff.selectRoleHint}
          />
          <ul className="mb-4 grid gap-2">
            {staff.roles.map((role) => (
              <li
                key={role.assignmentId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2"
              >
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  <BadgeCheck size={14} aria-hidden="true" />
                  {labelRole(role.code)}
                </span>
                {role.code !== MASTER.platformRole.SUPER_ADMIN ? (
                  <PlatformRoleRevokeButton assignmentId={role.assignmentId} />
                ) : null}
              </li>
            ))}
          </ul>
          <PlatformRoleAssignForm
            userProfileId={staff.id}
            roles={platformRoles}
            assignedRoleIds={staff.roles.map((role) => role.roleId)}
          />
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
