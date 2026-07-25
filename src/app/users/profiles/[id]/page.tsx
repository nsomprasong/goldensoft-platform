import Link from "next/link";
import { notFound } from "next/navigation";

import {
  MembershipRoleAssignForm,
  RoleRevokeButton,
} from "@/components/membership-role-form";
import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DetailList,
  PageHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { labelRole, labelStatus, TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import { resolveEffectivePermissions } from "@/lib/permissions/effective";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UserProfileAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePlatformPage();
  const actor = await loadActorAccess(prisma, ctx.user.id);
  const permissions = permissionsForRoles({
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
  if (!permissions.includes(PLATFORM_PERMISSIONS.userRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const { id } = await params;
  const assignmentActive = await prisma.assignmentStatus.findUnique({
    where: { code: MASTER.assignmentStatus.ACTIVE },
  });
  const profile = await prisma.userProfile.findUnique({
    where: { id },
    include: {
      status: true,
      platformRoles: {
        where: assignmentActive
          ? { statusId: assignmentActive.id, revokedAt: null }
          : undefined,
        include: { role: true },
      },
      memberships: {
        include: {
          organization: {
            select: { id: true, displayName: true, customerCode: true },
          },
          status: true,
          roles: {
            where: assignmentActive
              ? { statusId: assignmentActive.id, revokedAt: null }
              : undefined,
            include: { role: true, status: true },
          },
          branchScopes: {
            include: {
              scopeType: true,
              branch: { select: { code: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!profile || profile.deletedAt) notFound();

  const isSuper =
    actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) ||
    actor.platformRoles.includes(MASTER.platformRole.SUPPORT);
  if (
    !isSuper &&
    !profile.memberships.some((m) =>
      actor.membershipOrganizationIds.includes(m.organizationId),
    )
  ) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const canAssign = permissions.includes(PLATFORM_PERMISSIONS.roleAssign);
  const effective = await resolveEffectivePermissions(prisma, {
    authUserId: profile.authUserId,
    organizationId: ctx.activeOrganization?.id ?? null,
  });

  const membershipsVisible = isSuper
    ? profile.memberships
    : profile.memberships.filter((m) =>
        actor.membershipOrganizationIds.includes(m.organizationId),
      );

  const roleOptionsByOrg: Record<
    string,
    Array<{ id: string; code: string; nameTh: string; isSystem: boolean }>
  > = {};
  const orgIdsForRoles = membershipsVisible.map((m) => m.organizationId);
  if (orgIdsForRoles.length > 0) {
    const roles = await prisma.organizationRole.findMany({
      where: {
        isActive: true,
        OR: [
          { organizationId: null, isSystem: true },
          { organizationId: { in: orgIdsForRoles } },
        ],
      },
      select: {
        id: true,
        code: true,
        nameTh: true,
        isSystem: true,
        organizationId: true,
      },
      orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }],
    });
    for (const orgId of orgIdsForRoles) {
      roleOptionsByOrg[orgId] = roles.filter(
        (r) => r.organizationId === null || r.organizationId === orgId,
      );
    }
  }

  const audits = await prisma.auditLog.findMany({
    where: {
      OR: [
        { actorAuthUserId: profile.authUserId },
        { entityType: "UserProfile", entityId: profile.id },
      ],
    },
    include: { actionType: { select: { nameTh: true, code: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={profile.displayName}
        description={profile.email}
        status={
          <StatusBadge
            label={labelStatus(profile.status.code)}
            code={profile.status.code}
          />
        }
        actions={
          <Link href="/users" className="btn-secondary">
            {TH.common.back}
          </Link>
        }
      />

      <div className="grid gap-4">
        <section className="card">
          <DetailList
            items={[
              { label: "อีเมล", value: profile.email },
              { label: "Auth User", value: profile.authUserId },
              {
                label: "บทบาทแพลตฟอร์ม",
                value:
                  profile.platformRoles.map((r) => r.role.code).join(", ") ||
                  "—",
              },
            ]}
          />
        </section>

        {membershipsVisible.map((m) => (
          <section key={m.id} className="card space-y-3">
            <h3 className="font-semibold">
              {m.organization.displayName} ({m.organization.customerCode})
            </h3>
            <StatusBadge
              label={labelStatus(m.status.code)}
              code={m.status.code}
            />
            <ul className="space-y-2 text-sm">
              {m.roles.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>
                    {labelRole(r.role.code)} · {r.role.nameTh}
                    {r.role.isSystem ? "" : " (กำหนดเอง)"}
                  </span>
                  {canAssign ? <RoleRevokeButton assignmentId={r.id} /> : null}
                </li>
              ))}
            </ul>
            <p className="text-sm text-[var(--text-secondary)]">
              ขอบเขตสาขา:{" "}
              {m.branchScopes
                .map(
                  (s) =>
                    `${s.scopeType.code}${s.branch ? `:${s.branch.code}` : ""}`,
                )
                .join(", ") || "—"}
            </p>
            {canAssign ? (
              <MembershipRoleAssignForm
                membershipId={m.id}
                roles={roleOptionsByOrg[m.organizationId] ?? []}
              />
            ) : null}
          </section>
        ))}

        <section className="card space-y-2">
          <h3 className="font-semibold">Effective Permissions</h3>
          <ul className="max-h-80 space-y-1 overflow-auto text-sm">
            {effective.permissions.length === 0 ? (
              <li>—</li>
            ) : (
              effective.permissions.map((p) => (
                <li key={`${p.code}-${p.sourceRole}-${p.organizationId}`}>
                  <strong>{p.nameTh}</strong> ({p.code}) · {p.sourceRole} ·{" "}
                  {p.organizationScope} · {p.branchScope}
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="card space-y-2">
          <h3 className="font-semibold">บันทึกกิจกรรม</h3>
          <ul className="space-y-1 text-sm">
            {audits.map((a) => (
              <li key={a.id}>
                {a.actionType.nameTh} · {a.createdAt.toLocaleString("th-TH")}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PlatformShell>
  );
}
