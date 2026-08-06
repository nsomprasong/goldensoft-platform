import { Building2 } from "lucide-react";

import { OrganizationOnboardingWizard } from "@/components/organization-onboarding-wizard";
import { PlatformShell } from "@/components/platform-shell";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { TH } from "@/lib/i18n/th";
import { canCreateOrganization } from "@/lib/platform/organizations-admin";
import { MASTER } from "@/lib/platform/master-codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewOrganizationPage() {
  const ctx = await requirePlatformPage();
  const actor = await loadActorAccess(prisma, ctx.user.id);
  const isSuper = actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
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

  if (!canCreateOrganization(actor)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const [products, plans] = await Promise.all([
    prisma.product.findMany({
      where: { status: { code: "ACTIVE" } },
      select: { code: true, name: true, nameTh: true },
      orderBy: { sortOrder: "asc" },
      take: 50,
    }),
    prisma.plan.findMany({
      where: { status: { code: "ACTIVE" } },
      select: {
        code: true,
        name: true,
        product: { select: { code: true } },
      },
      orderBy: { sortOrder: "asc" },
      take: 100,
    }),
  ]);

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        icon={<Building2 aria-hidden="true" />}
        title={TH.org.onboardTitle}
        meta={
          <span className="inline-flex items-center rounded-full border border-[var(--page-header-border)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] shadow-[var(--shadow-xs)]">
            ตั้งค่าองค์กรให้พร้อมใช้งานใน 5 ขั้นตอน
          </span>
        }
        description={
          isSuper
            ? "สร้างองค์กร สาขาหลัก เจ้าของ ผลิตภัณฑ์ และแพ็กเกจในขั้นตอนเดียว"
            : "สร้างองค์กรลูกค้า สาขาหลัก ผู้ดูแล (ADMIN) และแพ็กเกจ — องค์กรจะผูกกับพอร์ตโฟลิโอของคุณอัตโนมัติ"
        }
      />
      <OrganizationOnboardingWizard
        contactRole={isSuper ? "OWNER" : "ADMIN"}
        products={products.map((p) => ({
          code: p.code,
          name: p.nameTh ?? p.name,
        }))}
        plans={plans.map((p) => ({
          code: p.code,
          name: p.name,
          productCode: p.product.code,
        }))}
      />
    </PlatformShell>
  );
}
