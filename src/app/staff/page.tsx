import {
  BadgeCheck,
  IdCard,
  Mail,
  PencilLine,
  Phone,
  UserPlus,
  UsersRound,
} from "lucide-react";

import { PlatformShell } from "@/components/platform-shell";
import { StaffInviteButton } from "@/components/staff-invite-button";
import { StaffPasswordResetButton } from "@/components/staff-password-reset-button";
import {
  AccessDenied,
  EmptyState,
  PageHeader,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import {
  IconTextLink,
  LabeledIconLink,
  labeledActionSoftClassName,
} from "@/components/ui/labeled-icon-button";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { labelRole, labelStatus, TH } from "@/lib/i18n/th";
import {
  formatNationalIdForDisplay,
  formatPhoneForDisplay,
} from "@/lib/platform/staff-identity";
import {
  canManageStaff,
  canResetUserPassword,
  listStaffMembers,
} from "@/lib/platform/staff";
import { isInvitationSendEnabled } from "@/lib/platform/system-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function initialsFromName(name: string): string {
  const parts = name
    .replace(/^(นาย|นางสาว|นาง)\s+/u, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2);
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`;
}

export default async function StaffPage() {
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
    pageTitle: TH.staff.title,
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

  const staff = await listStaffMembers(prisma);
  const canResetPassword = canResetUserPassword(actor);
  const invitationsSendEnabled = await isInvitationSendEnabled(prisma);

  function accountState(row: (typeof staff)[number]) {
    if (row.openPasswordReset) {
      return `${TH.staff.passwordResetPendingUntil} ${row.openPasswordReset.expiresAt.toLocaleString("th-TH")}`;
    }
    return row.lastLoginAt
      ? `${TH.staff.lastLoginAt}: ${row.lastLoginAt.toLocaleString("th-TH")}`
      : TH.staff.neverLoggedIn;
  }

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={TH.pages.staffTitle}
        description={TH.pages.staffBody}
        icon={<UsersRound size={24} />}
        actions={
          <IconTextLink
            href="/staff/new"
            label={TH.staff.add}
            icon={<UserPlus className="size-5" />}
          />
        }
      />

      <section className="card overflow-hidden !p-0">
        <div className="border-b border-[var(--border)] bg-[linear-gradient(180deg,#fffaf5_0%,#ffffff_100%)] px-4 py-4 sm:px-5">
          <SectionHeader
            title={TH.staff.list}
            description={`${TH.common.foundTotal} ${staff.length} ${TH.common.items}`}
            badge={
              <span className="inline-flex items-center rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-[length:var(--text-caption)] font-semibold text-[var(--primary)]">
                {staff.length}
              </span>
            }
          />
        </div>

        {staff.length === 0 ? (
          <div className="px-4 py-6 sm:px-5">
            <EmptyState
              title={TH.staff.empty}
              body={TH.staff.emptyHint}
              action={
                <IconTextLink
                  href="/staff/new"
                  label={TH.staff.add}
                  icon={<UserPlus className="size-5" />}
                />
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {staff.map((row) => {
              const statusLabel = row.openPasswordReset
                ? TH.staff.passwordResetPending
                : labelStatus(row.statusCode);
              const statusCode = row.openPasswordReset
                ? "PENDING"
                : row.statusCode;

              return (
                <li
                  key={row.id}
                  className="group px-4 py-4 transition-colors hover:bg-[var(--primary-soft)]/35 sm:px-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3.5">
                      <div
                        className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#fff7ed_0%,#ffedd5_55%,#fed7aa_100%)] text-sm font-semibold tracking-wide text-[var(--primary)] shadow-[var(--shadow-xs)] ring-1 ring-[var(--page-header-border)]"
                        aria-hidden="true"
                      >
                        {initialsFromName(row.displayName)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-[var(--foreground)]">
                            {row.displayName}
                          </h3>
                          <StatusBadge label={statusLabel} code={statusCode} />
                        </div>

                        <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                          {accountState(row)}
                        </p>

                        <dl className="mt-3 grid gap-1.5 text-[length:var(--text-helper)] text-[var(--text-secondary)] sm:grid-cols-2 xl:grid-cols-3">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <Mail
                              className="size-3.5 shrink-0 text-[var(--text-muted)]"
                              aria-hidden="true"
                            />
                            <dt className="sr-only">{TH.users.email}</dt>
                            <dd className="truncate">{row.email}</dd>
                          </div>
                          <div className="flex min-w-0 items-center gap-1.5">
                            <Phone
                              className="size-3.5 shrink-0 text-[var(--text-muted)]"
                              aria-hidden="true"
                            />
                            <dt className="sr-only">{TH.staff.phone}</dt>
                            <dd>
                              {row.phone
                                ? formatPhoneForDisplay(row.phone)
                                : "—"}
                            </dd>
                          </div>
                          <div className="flex min-w-0 items-center gap-1.5 sm:col-span-2 xl:col-span-1">
                            <IdCard
                              className="size-3.5 shrink-0 text-[var(--text-muted)]"
                              aria-hidden="true"
                            />
                            <dt className="sr-only">{TH.staff.nationalId}</dt>
                            <dd className="font-mono tracking-wide">
                              {row.nationalId
                                ? formatNationalIdForDisplay(row.nationalId)
                                : "—"}
                            </dd>
                          </div>
                        </dl>

                        <ul className="mt-3 flex flex-wrap gap-1.5">
                          {row.roles.map((role) => (
                            <li
                              key={role.assignmentId}
                              className="inline-flex items-center gap-1 rounded-full border border-[var(--page-header-border)] bg-white px-2.5 py-0.5 text-xs font-medium text-[var(--primary)] shadow-[var(--shadow-xs)]"
                            >
                              <BadgeCheck size={12} aria-hidden="true" />
                              {labelRole(role.code)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div
                      className="flex shrink-0 flex-wrap items-start gap-3 lg:justify-end"
                      role="group"
                      aria-label={TH.common.actions}
                    >
                      <LabeledIconLink
                        href={`/staff/${row.id}/edit`}
                        variant="outline"
                        label={TH.common.edit}
                        className={labeledActionSoftClassName}
                        icon={<PencilLine aria-hidden="true" />}
                      />
                      {invitationsSendEnabled ? (
                        <StaffInviteButton userProfileId={row.id} />
                      ) : null}
                      {canResetPassword ? (
                        <StaffPasswordResetButton
                          userProfileId={row.id}
                          openResetId={row.openPasswordReset?.id ?? null}
                        />
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PlatformShell>
  );
}
