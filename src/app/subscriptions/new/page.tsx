import { ArrowLeft } from "lucide-react";

import { SubscriptionForm } from "@/components/subscription-form";
import { PlatformShell } from "@/components/platform-shell";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewSubscriptionPage() {
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
    organizations: membershipOrganizationOptions(ctx.bundle),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
  };
  if (!perms.includes(PLATFORM_PERMISSIONS.subscriptionManage)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const isSuper = actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
  const [orgs, products, billingCycles] = await Promise.all([
    prisma.organization.findMany({
      where: isSuper
        ? { status: { code: MASTER.organizationStatus.ACTIVE } }
        : {
            id: { in: actor.membershipOrganizationIds },
            status: { code: MASTER.organizationStatus.ACTIVE },
          },
      select: { id: true, displayName: true, customerCode: true },
      orderBy: { displayName: "asc" },
      take: 200,
    }),
    prisma.product.findMany({
      where: { status: { code: MASTER.productStatus.ACTIVE } },
      select: {
        id: true,
        code: true,
        name: true,
        plans: {
          where: { status: { code: MASTER.planStatus.ACTIVE } },
          select: { code: true, name: true },
          orderBy: { code: "asc" },
        },
      },
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
        title="สร้างการสมัครใช้บริการ"
        actions={
          <IconTextLink
            href="/subscriptions"
            variant="outline"
            label={TH.common.back}
            icon={<ArrowLeft className="size-5" />}
          />
        }
      />
      <section className="card max-w-2xl">
        <SubscriptionForm
          organizations={orgs.map((o) => ({
            id: o.id,
            label: `${o.customerCode} — ${o.displayName}`,
          }))}
          products={products}
          billingCycles={billingCycles}
        />
      </section>
    </PlatformShell>
  );
}
