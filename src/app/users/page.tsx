import Link from "next/link";
import { FilterX, Search, UserPlus, Users } from "lucide-react";

import { PlatformShell } from "@/components/platform-shell";
import { ResendInviteButton } from "@/components/resend-invite-button";
import {
  AccessDenied,
  DataTable,
  EmptyState,
  MobileRecordCard,
  PageHeader,
  SearchFilterBar,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import {
  IconTextButton,
  IconTextLink,
} from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import {
  TH,
  labelInvitationStatus,
  labelRole,
  labelStatus,
} from "@/lib/i18n/th";
import { logServerTiming, measure } from "@/lib/perf/server-timing";
import {
  invitationVisibleInBranch,
  membershipBranchLabels,
  membershipVisibleInBranch,
  parseBranchIdsJson,
} from "@/lib/platform/branch-data-scope";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requirePlatformPage();
  const params = await searchParams;
  const actor = await loadActorAccess(prisma, ctx.user.id);
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles,
  });
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

  if (!perms.includes(PLATFORM_PERMISSIONS.userRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const activeOrganizationId = ctx.activeOrganization?.id ?? null;
  const activeBranchId = ctx.activeBranch?.id ?? null;
  const orgFilter = activeOrganizationId
    ? { organizationId: activeOrganizationId }
    : actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) ||
        actor.platformRoles.includes(MASTER.platformRole.SUPPORT)
      ? undefined
      : {
          organizationId: {
            in: [
              ...new Set([
                ...actor.membershipOrganizationIds,
                ...actor.managedOrganizationIds,
              ]),
            ],
          },
        };

  const q = params.q?.trim();
  const [membershipRows, invitationRows, orgBranches] = await measure(
    "data",
    () =>
      Promise.all([
        prisma.organizationMembership.findMany({
          where: {
            ...orgFilter,
            ...(q
              ? {
                  OR: [
                    {
                      userProfile: {
                        email: { contains: q, mode: "insensitive" },
                      },
                    },
                    {
                      userProfile: {
                        displayName: { contains: q, mode: "insensitive" },
                      },
                    },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            userProfile: {
              select: {
                id: true,
                displayName: true,
                email: true,
                status: { select: { code: true } },
              },
            },
            organization: {
              select: { displayName: true },
            },
            status: { select: { code: true } },
            roles: {
              where: { revokedAt: null },
              select: {
                role: { select: { code: true } },
                status: { select: { code: true } },
              },
            },
            branchScopes: {
              select: {
                branchId: true,
                scopeType: { select: { code: true } },
                branch: { select: { id: true, name: true, code: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
        prisma.userInvitation.findMany({
          where: {
            ...orgFilter,
            ...(q
              ? {
                  OR: [
                    { emailNormalized: { contains: q, mode: "insensitive" } },
                    { displayName: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            emailNormalized: true,
            displayName: true,
            createdAt: true,
            attemptCount: true,
            branchIdsJson: true,
            organization: { select: { displayName: true } },
            organizationRole: { select: { code: true } },
            branchScopeType: { select: { code: true } },
            status: { select: { code: true } },
            invitedByProfile: { select: { displayName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
        activeOrganizationId
          ? prisma.branch.findMany({
              where: { organizationId: activeOrganizationId, deletedAt: null },
              select: { id: true, name: true, code: true },
            })
          : Promise.resolve(
              [] as Array<{ id: string; name: string; code: string }>,
            ),
      ]),
  );
  logServerTiming();

  const branchNameById = new Map([
    ...orgBranches.map((b) => [b.id, b.name] as const),
    ...ctx.branches.map((b) => [b.id, b.name] as const),
  ]);

  const memberships = membershipRows
    .filter((m) =>
      activeBranchId
        ? membershipVisibleInBranch(
            m.branchScopes.map((s) => ({
              scopeTypeCode: s.scopeType.code,
              branchId: s.branchId,
            })),
            activeBranchId,
          )
        : true,
    )
    .slice(0, 50)
    .map((m) => ({
      ...m,
      branchLabel: membershipBranchLabels(
        m.branchScopes.map((s) => ({
          scopeTypeCode: s.scopeType.code,
          branchId: s.branchId,
        })),
        branchNameById,
      ),
    }));

  const invitations = invitationRows
    .filter((invitation) =>
      activeBranchId
        ? invitationVisibleInBranch(
            {
              scopeTypeCode: invitation.branchScopeType.code,
              branchIds: parseBranchIdsJson(invitation.branchIdsJson),
            },
            activeBranchId,
          )
        : true,
    )
    .slice(0, 50);

  const canInvite = perms.includes(PLATFORM_PERMISSIONS.userInvite);
  const branchScopeNote = ctx.activeBranch
    ? `กำลังแสดงเฉพาะสาขา ${ctx.activeBranch.name} (${ctx.activeBranch.code}) — สมาชิกทุกสาขายังปรากฏ`
    : null;

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={TH.pages.usersTitle}
        description={
          branchScopeNote
            ? `${TH.pages.usersBody} · ${branchScopeNote}`
            : TH.pages.usersBody
        }
        icon={<Users size={24} />}
        actions={
          canInvite ? (
            <IconTextLink
              href="/users/invite"
              label={TH.users.add}
              icon={<UserPlus className="size-5" />}
            />
          ) : null
        }
      />

      <div className="grid min-w-0 gap-4">
        <section className="card min-w-0">
          <SearchFilterBar
            resultLabel={`${TH.common.foundTotal} ${memberships.length} ${TH.common.items}`}
          >
            <form
              method="get"
              className="grid w-full min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
            >
              <label className="min-w-0 text-[length:var(--text-label)]">
                <span className="mb-1 block font-medium">{TH.common.search}</span>
                <Input
                  name="q"
                  defaultValue={params.q ?? ""}
                  placeholder="ชื่อหรืออีเมล"
                  aria-label={TH.common.search}
                />
              </label>
              <IconTextButton
                type="submit"
                label={TH.common.search}
                icon={<Search className="size-5" />}
              />
              {params.q ? (
                <IconTextLink
                  href="/users"
                  variant="outline"
                  label={TH.common.clearFilter}
                  icon={<FilterX className="size-5" />}
                />
              ) : null}
            </form>
          </SearchFilterBar>
        </section>

        {invitations.length > 0 ? (
          <section className="card min-w-0">
            <SectionHeader title="คำเชิญผู้ใช้งาน" />
            <ul className="mb-4 space-y-3 md:hidden">
              {invitations.map((invitation) => {
                const canResendInvite =
                  canInvite &&
                  ["PENDING", "FAILED", "PLATFORM_SETUP_FAILED"].includes(
                    invitation.status.code,
                  );
                return (
                  <li key={invitation.id}>
                    <MobileRecordCard
                      title={
                        <Link
                          href={`/users/${invitation.id}`}
                          className="text-[var(--primary)]"
                        >
                          {invitation.displayName}
                        </Link>
                      }
                      subtitle={invitation.emailNormalized}
                      status={
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <StatusBadge
                            label={labelInvitationStatus(invitation.status.code)}
                            code={invitation.status.code}
                          />
                          {canResendInvite ? (
                            <ResendInviteButton invitationId={invitation.id} />
                          ) : null}
                        </div>
                      }
                      meta={
                        <>
                          {invitation.organization.displayName} ·{" "}
                          {labelRole(invitation.organizationRole.code)}
                          <br />
                          {invitation.branchScopeType.code ===
                          MASTER.branchScopeType.ALL_BRANCHES
                            ? "ทุกสาขา"
                            : parseBranchIdsJson(invitation.branchIdsJson)
                                .map((id) => branchNameById.get(id) ?? id)
                                .join(", ") || "—"}
                          <br />
                          {invitation.createdAt.toLocaleString("th-TH")} ·{" "}
                          {invitation.invitedByProfile.displayName}
                        </>
                      }
                    />
                  </li>
                );
              })}
            </ul>
            <DataTable
              headers={[
                TH.users.displayName,
                TH.users.email,
                TH.nav.organizations,
                "บทบาท",
                TH.nav.branches,
                "วันที่เชิญ",
                "ผู้เชิญ",
                TH.common.status,
                TH.common.actions,
              ]}
            >
              {invitations.map((invitation) => (
                <tr
                  key={invitation.id}
                  className="border-b border-[var(--border)] hover:bg-[var(--surface-muted)]/60"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/users/${invitation.id}`}
                      className="font-medium text-[var(--primary)]"
                    >
                      {invitation.displayName}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">{invitation.emailNormalized}</td>
                  <td className="px-3 py-2.5">
                    {invitation.organization.displayName}
                  </td>
                  <td className="px-3 py-2.5">
                    {labelRole(invitation.organizationRole.code)}
                  </td>
                  <td className="px-3 py-2.5">
                    {invitation.branchScopeType.code ===
                    MASTER.branchScopeType.ALL_BRANCHES
                      ? "ทุกสาขา"
                      : parseBranchIdsJson(invitation.branchIdsJson)
                          .map((id) => branchNameById.get(id) ?? id)
                          .join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {invitation.createdAt.toLocaleString("th-TH")}
                  </td>
                  <td className="px-3 py-2.5">
                    {invitation.invitedByProfile.displayName}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      label={labelInvitationStatus(invitation.status.code)}
                      code={invitation.status.code}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    {canInvite &&
                    ["PENDING", "FAILED", "PLATFORM_SETUP_FAILED"].includes(
                      invitation.status.code,
                    ) ? (
                      <ResendInviteButton invitationId={invitation.id} />
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          </section>
        ) : null}

        <section className="card min-w-0">
          <SectionHeader title="สมาชิกองค์กร" />
          {memberships.length === 0 ? (
            <EmptyState title={TH.common.empty} body={TH.common.notFound} />
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {memberships.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/users/profiles/${m.userProfile.id}`}
                      className="block"
                    >
                      <MobileRecordCard
                        title={m.userProfile.displayName}
                        subtitle={m.userProfile.email}
                        status={
                          <StatusBadge
                            label={labelStatus(m.status.code)}
                            code={m.status.code}
                          />
                        }
                        meta={
                          <>
                            {m.organization.displayName}
                            <br />
                            {m.roles
                              .filter((r) => r.status.code === "ACTIVE")
                              .map((r) => labelRole(r.role.code))
                              .join(", ") || "-"}
                            <br />
                            สาขา: {m.branchLabel}
                          </>
                        }
                      />
                    </Link>
                  </li>
                ))}
              </ul>
              <DataTable
                headers={[
                  TH.users.displayName,
                  TH.users.email,
                  TH.nav.organizations,
                  "บทบาท",
                  TH.nav.branches,
                  TH.common.status,
                ]}
              >
                {memberships.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-[var(--border)] hover:bg-[var(--surface-muted)]/60"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/users/profiles/${m.userProfile.id}`}
                        className="font-medium text-[var(--primary)]"
                      >
                        {m.userProfile.displayName}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">{m.userProfile.email}</td>
                    <td className="px-3 py-2.5">
                      {m.organization.displayName}
                    </td>
                    <td className="px-3 py-2.5">
                      {m.roles
                        .filter((r) => r.status.code === "ACTIVE")
                        .map((r) => labelRole(r.role.code))
                        .join(", ") || "-"}
                    </td>
                    <td className="px-3 py-2.5">{m.branchLabel}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge
                        label={labelStatus(m.status.code)}
                        code={m.status.code}
                      />
                    </td>
                  </tr>
                ))}
              </DataTable>
            </>
          )}
        </section>
      </div>
    </PlatformShell>
  );
}
