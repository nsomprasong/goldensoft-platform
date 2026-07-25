import Link from "next/link";
import { notFound } from "next/navigation";

import { PlanForm } from "@/components/plan-form";
import { PlatformShell } from "@/components/platform-shell";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { getPlan } from "@/lib/platform/plans-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
  const { id } = await params;
  let plan;
  try {
    plan = await getPlan(prisma, id);
  } catch {
    notFound();
  }
  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={`แก้ไข ${plan.name}`}
        actions={
          <Link href={`/plans/${plan.id}`} className="btn-secondary">
            {TH.common.back}
          </Link>
        }
      />
      <section className="card max-w-2xl">
        <PlanForm
          mode="edit"
          planId={plan.id}
          products={[]}
          billingCycles={[]}
          initial={{
            productId: plan.productId,
            code: plan.code,
            name: plan.name,
            description: plan.description,
            sortOrder: plan.sortOrder,
          }}
        />
      </section>
    </PlatformShell>
  );
}
