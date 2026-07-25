import { OrganizationOnboardingWizard } from "@/components/organization-onboarding-wizard";
import { PlatformShell } from "@/components/platform-shell";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewOrganizationPage() {
  const ctx = await requirePlatformPage();
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
  };

  if (!ctx.bundle.platformRoles.includes("SUPER_ADMIN")) {
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
        title="เริ่มใช้งานองค์กรใหม่"
        description="สร้างองค์กร สาขาหลัก เจ้าของ ผลิตภัณฑ์ และแพ็กเกจในขั้นตอนเดียว"
      />
      <OrganizationOnboardingWizard
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
