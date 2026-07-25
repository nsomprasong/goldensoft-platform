import Link from "next/link";

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
import { IconUsers } from "@/components/ui/icons";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import {
  TH,
  labelInvitationStatus,
  labelRole,
  labelStatus,
} from "@/lib/i18n/th";
import { logServerTiming, measure } from "@/lib/perf/server-timing";
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
    organizations: ctx.bundle.memberships.map((m) => ({
      id: m.organizationId,
      name: m.organizationName,
    })),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
  };

  if (!perms.includes(PLATFORM_PERMISSIONS.userRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const orgFilter =
    actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) ||
    actor.platformRoles.includes(MASTER.platformRole.SUPPORT)
      ? undefined
      : { organizationId: { in: actor.membershipOrganizationIds } };

  const q = params.q?.trim();
  const [memberships, invitations] = await measure("data", () =>
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
        },
        orderBy: { createdAt: "desc" },
        take: 50,
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
          organization: { select: { displayName: true } },
          organizationRole: { select: { code: true } },
          status: { select: { code: true } },
          invitedByProfile: { select: { displayName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]),
  );
  logServerTiming();

  const canInvite = perms.includes(PLATFORM_PERMISSIONS.userInvite);

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={TH.pages.usersTitle}
        description={TH.pages.usersBody}
        icon={<IconUsers size={24} />}
        actions={
          canInvite ? (
            <Link href="/users/invite" className="btn btn-block-mobile">
              {TH.users.add}
            </Link>
          ) : null
        }
      />

      <div className="grid gap-4">
        <section className="card">
          <SearchFilterBar
            resultLabel={`${TH.common.foundTotal} ${memberships.length} ${TH.common.items}`}
          >
            <form method="get" className="flex w-full flex-wrap items-end gap-2">
              <label className="min-w-[12rem] flex-1 text-[length:var(--text-label)]">
                <span className="mb-1 block font-medium">{TH.common.search}</span>
                <input
                  name="q"
                  defaultValue={params.q ?? ""}
                  placeholder="ชื่อหรืออีเมล"
                  className="input"
                  aria-label={TH.common.search}
                />
              </label>
              <button className="btn" type="submit">
                {TH.common.search}
              </button>
              {params.q ? (
                <Link href="/users" className="btn btn-secondary">
                  {TH.common.clearFilter}
                </Link>
              ) : null}
            </form>
          </SearchFilterBar>
        </section>

        {invitations.length > 0 ? (
          <section className="card">
            <SectionHeader title="คำเชิญผู้ใช้งาน" />
            <ul className="mb-4 space-y-3 md:hidden">
              {invitations.map((invitation) => (
                <MobileRecordCard
                  key={invitation.id}
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
                    <StatusBadge
                      label={labelInvitationStatus(invitation.status.code)}
                      code={invitation.status.code}
                    />
                  }
                  meta={
                    <>
                      {invitation.organization.displayName} ·{" "}
                      {labelRole(invitation.organizationRole.code)}
                      <br />
                      {invitation.createdAt.toLocaleString("th-TH")} ·{" "}
                      {invitation.invitedByProfile.displayName}
                    </>
                  }
                  actions={
                    canInvite &&
                    ["PENDING", "AUTH_SENT", "FAILED", "PLATFORM_SETUP_FAILED"].includes(
                      invitation.status.code,
                    ) ? (
                      <ResendInviteButton invitationId={invitation.id} />
                    ) : null
                  }
                />
              ))}
            </ul>
            <DataTable
              headers={[
                TH.users.displayName,
                TH.users.email,
                TH.nav.organizations,
                "บทบาท",
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
                    ["PENDING", "AUTH_SENT", "FAILED", "PLATFORM_SETUP_FAILED"].includes(
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

        <section className="card">
          <SectionHeader title="สมาชิกองค์กร" />
          {memberships.length === 0 ? (
            <EmptyState title={TH.common.empty} body={TH.common.notFound} />
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {memberships.map((m) => (
                  <Link
                    key={m.id}
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
                        </>
                      }
                    />
                  </Link>
                ))}
              </ul>
              <DataTable
                headers={[
                  TH.users.displayName,
                  TH.users.email,
                  TH.nav.organizations,
                  TH.common.status,
                  "บทบาท",
                ]}
              >
                {memberships.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-[var(--border)] hover:bg-[var(--surface-muted)]/60"
                  >
                    <td className="px-3 py-2.5 font-medium">
                      <Link
                        href={`/users/profiles/${m.userProfile.id}`}
                        className="text-[var(--accent)] hover:underline"
                      >
                        {m.userProfile.displayName}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">{m.userProfile.email}</td>
                    <td className="px-3 py-2.5">{m.organization.displayName}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge
                        label={labelStatus(m.status.code)}
                        code={m.status.code}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-[length:var(--text-helper)]">
                      {m.roles
                        .filter((r) => r.status.code === "ACTIVE")
                        .map((r) => labelRole(r.role.code))
                        .join(", ") || "-"}
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
