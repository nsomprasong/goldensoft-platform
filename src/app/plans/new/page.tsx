import Link from "next/link";

import { PlanForm } from "@/components/plan-form";
import { PlatformShell } from "@/components/platform-shell";
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

export default async function NewPlanPage() {
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
  if (!perms.includes(PLATFORM_PERMISSIONS.planManage)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }
  const [products, billingCycles] = await Promise.all([
    prisma.product.findMany({
      where: { status: { code: MASTER.productStatus.ACTIVE } },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.billingCycle.findMany({
      where: { isActive: true },
      select: { code: true, nameTh: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title="เพิ่มแพ็กเกจ"
        actions={
          <Link href="/plans" className="btn-secondary">
            {TH.common.back}
          </Link>
        }
      />
      <section className="card max-w-2xl">
        <PlanForm
          mode="create"
          products={products}
          billingCycles={billingCycles}
        />
      </section>
    </PlatformShell>
  );
}
