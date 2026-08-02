import { Eraser } from "lucide-react";

import { DataResetPanel } from "@/components/data-reset-panel";
import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  PageHeader,
  SectionHeader,
} from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { TH } from "@/lib/i18n/th";
import { listDataResetTargets } from "@/lib/ops/data-reset";
import { DATA_RESET_CONFIRM_PHRASE } from "@/lib/ops/data-reset-types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DataResetPage() {
  const ctx = await requirePlatformPage();
  const shellProps = {
    displayName: ctx.bundle.profile?.displayName ?? TH.common.user,
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: membershipOrganizationOptions(ctx.bundle),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
    pageTitle: TH.pages.dataResetTitle,
  };

  if (!ctx.bundle.platformRoles.includes("SUPER_ADMIN")) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const targets = await listDataResetTargets(prisma);

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={TH.pages.dataResetTitle}
        description={TH.pages.dataResetBody}
        icon={<Eraser size={24} />}
      />

      <section className="card">
        <SectionHeader
          title="เลือกองค์กร / สาขาที่ต้องการลบ"
          description="เมื่อเลือกลบ ระบบจะลบข้อมูลที่เกี่ยวข้องใน Platform และ HR (ถ้ามี) ของรายการนั้น — องค์กร GOLDENSOFT ล็อกไว้เสมอ"
        />
        <DataResetPanel
          targets={targets}
          confirmPhrase={DATA_RESET_CONFIRM_PHRASE}
        />
      </section>
    </PlatformShell>
  );
}
