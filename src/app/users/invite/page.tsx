import { PlatformShell } from "@/components/platform-shell";
import { UserInviteWizard } from "@/components/user-invite-wizard";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { loadActorAccess } from "@/lib/auth/actor-access";
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
  };

  if (!perms.includes(PLATFORM_PERMISSIONS.userInvite)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const orgIds =
    actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)
      ? (
          await prisma.organization.findMany({
            where: { deletedAt: null },
            select: { id: true, displayName: true },
            orderBy: { displayName: "asc" },
          })
        ).map((o) => ({ id: o.id, name: o.displayName }))
      : ctx.bundle.memberships.map((m) => ({
          id: m.organizationId,
          name: m.organizationName,
        }));

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

  return (
    <PlatformShell {...shellProps}>
      <section className="card max-w-xl">
        <PageHeader title={TH.users.add} description={TH.users.invite} />
        <UserInviteWizard organizations={orgIds} branchesByOrg={branchesByOrg} />
      </section>
    </PlatformShell>
  );
}
