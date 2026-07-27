import { ArrowLeft } from "lucide-react";

import { PlanForm } from "@/components/plan-form";
import { PlatformShell } from "@/components/platform-shell";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";
import { catalogFeaturesForProduct } from "@/lib/platform/entitlements";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
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
  const sp = await searchParams;
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
  const featureCatalogByProductId: Record<
    string,
    Array<{
      code: string;
      name: string;
      valueKind: "boolean" | "numeric" | "text";
      defaultLimitValue: string | null;
    }>
  > = {};
  for (const product of products) {
    featureCatalogByProductId[product.id] = catalogFeaturesForProduct(
      product.code,
    ).map((f) => ({
      code: f.code,
      name: f.nameTh,
      valueKind: f.valueKind,
      defaultLimitValue: f.defaultLimitValue,
    }));
  }
  const preselectedProductId =
    sp.productId && products.some((p) => p.id === sp.productId)
      ? sp.productId
      : undefined;
  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title="เพิ่มแพ็กเกจ"
        actions={
          <IconTextLink
            href={
              preselectedProductId
                ? `/products/${preselectedProductId}`
                : "/plans"
            }
            variant="outline"
            label={TH.common.back}
            icon={<ArrowLeft className="size-5" />}
          />
        }
      />
      <section className="card max-w-3xl">
        <PlanForm
          mode="create"
          products={products}
          billingCycles={billingCycles}
          featureCatalogByProductId={featureCatalogByProductId}
          initial={
            preselectedProductId
              ? {
                  productId: preselectedProductId,
                  code: "",
                  name: "",
                  description: null,
                  sortOrder: 0,
                }
              : undefined
          }
        />
      </section>
    </PlatformShell>
  );
}
