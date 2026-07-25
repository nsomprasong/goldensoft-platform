import Link from "next/link";

import { PlatformShell } from "@/components/platform-shell";
import { ResendInviteButton } from "@/components/resend-invite-button";
import {
  AccessDenied,
  DataTable,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import {
  TH,
  labelInvitationStatus,
  labelRole,
  labelStatus,
} from "@/lib/i18n/th";
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
  const memberships = await prisma.organizationMembership.findMany({
    where: {
      ...orgFilter,
      ...(q
        ? {
            OR: [
              { userProfile: { email: { contains: q, mode: "insensitive" } } },
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
  });
  const invitations = await prisma.userInvitation.findMany({
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
  });

  const canInvite = perms.includes(PLATFORM_PERMISSIONS.userInvite);

  return (
    <PlatformShell {...shellProps}>
      <section className="card">
        <PageHeader
          title={TH.pages.usersTitle}
          actions={
            canInvite ? (
              <Link href="/users/invite" className="btn">
                {TH.users.add}
              </Link>
            ) : null
          }
        />
        {invitations.length > 0 ? (
          <div className="mb-6 overflow-x-auto">
            <h3 className="mb-2 font-semibold">คำเชิญผู้ใช้งาน</h3>
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
                <tr key={invitation.id} className="border-b border-[var(--border)]">
                  <td className="px-2 py-2">
                    <Link href={`/users/${invitation.id}`} className="underline">
                      {invitation.displayName}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{invitation.emailNormalized}</td>
                  <td className="px-2 py-2">{invitation.organization.displayName}</td>
                  <td className="px-2 py-2">
                    {labelRole(invitation.organizationRole.code)}
                  </td>
                  <td className="px-2 py-2">
                    {invitation.createdAt.toLocaleString("th-TH")}
                  </td>
                  <td className="px-2 py-2">
                    {invitation.invitedByProfile.displayName}
                  </td>
                  <td className="px-2 py-2">
                    <StatusBadge
                      label={labelInvitationStatus(invitation.status.code)}
                    />
                  </td>
                  <td className="px-2 py-2">
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
          </div>
        ) : null}
        <form method="get" className="mb-4 flex gap-2">
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder={TH.common.search}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          <button className="btn" type="submit">
            {TH.common.search}
          </button>
        </form>

        {memberships.length === 0 ? (
          <EmptyState title={TH.common.empty} />
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {memberships.map((m) => (
                <li key={m.id} className="rounded-xl border border-[var(--border)] p-3">
                  <p className="font-medium">{m.userProfile.displayName}</p>
                  <p className="text-xs text-slate-500">{m.userProfile.email}</p>
                  <p className="text-xs">{m.organization.displayName}</p>
                  <StatusBadge label={labelStatus(m.status.code)} />
                </li>
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
                <tr key={m.id} className="border-b border-[var(--border)]">
                  <td className="px-2 py-2">{m.userProfile.displayName}</td>
                  <td className="px-2 py-2">{m.userProfile.email}</td>
                  <td className="px-2 py-2">{m.organization.displayName}</td>
                  <td className="px-2 py-2">
                    <StatusBadge label={labelStatus(m.status.code)} />
                  </td>
                  <td className="px-2 py-2 text-xs">
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
    </PlatformShell>
  );
}
