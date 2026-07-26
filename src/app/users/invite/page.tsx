import { PlatformShell } from "@/components/platform-shell";
import { UserInviteWizard } from "@/components/user-invite-wizard";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { resolveInviteEnvironment } from "@/lib/auth/invite-env";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function InviteUserPage() {
  const ctx = await requirePlatformPage();
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
    contextMode: ctx.contextMode,
    canUseManagedOrgMode: ctx.managedOrganizationIds.length > 0,
  };

  if (!perms.includes(PLATFORM_PERMISSIONS.userInvite)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const orgIds = actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)
    ? (
        await prisma.organization.findMany({
          where: { deletedAt: null },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        })
      ).map((o) => ({ id: o.id, name: o.displayName }))
    : [
        ...ctx.bundle.memberships.map((m) => ({
          id: m.organizationId,
          name: m.organizationName,
        })),
        ...(actor.managedOrganizationIds.length > 0
          ? (
              await prisma.organization.findMany({
                where: { id: { in: actor.managedOrganizationIds }, deletedAt: null },
                select: { id: true, displayName: true },
                orderBy: { displayName: "asc" },
              })
            ).map((o) => ({ id: o.id, name: o.displayName }))
          : []),
      ];

  const branches = await prisma.branch.findMany({
    where: {
      deletedAt: null,
      organizationId: { in: orgIds.map((o) => o.id) },
    },
    select: { id: true, name: true, code: true, organizationId: true },
  });
  const branchesByOrg: Record<
    string,
    Array<{ id: string; name: string; code: string }>
  > = {};
  for (const b of branches) {
    branchesByOrg[b.organizationId] ??= [];
    branchesByOrg[b.organizationId]!.push({
      id: b.id,
      name: b.name,
      code: b.code,
    });
  }

  const isSuper = actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
  let inviteMode: "mock" | "real" = "mock";
  try {
    inviteMode = resolveInviteEnvironment(process.env).mode;
  } catch {
    inviteMode = "mock";
  }

  return (
    <PlatformShell {...shellProps}>
      <section className="card max-w-2xl">
        <PageHeader
          title={TH.users.add}
          description="กรอกข้อมูลและกำหนดสิทธิ์ก่อนส่งคำเชิญเข้าใช้งาน"
        />
        <UserInviteWizard
          organizations={orgIds}
          branchesByOrg={branchesByOrg}
          showTestModeBadge={isSuper && inviteMode === "mock"}
        />
      </section>
    </PlatformShell>
  );
}
