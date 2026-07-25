import { redirect } from "next/navigation";

import { PlatformShell } from "@/components/platform-shell";
import { AccessDenied } from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";

export const dynamic = "force-dynamic";

export default async function BranchesRedirectPage() {
  const ctx = await requirePlatformPage();
  if (ctx.activeOrganization) {
    redirect(`/organizations/${ctx.activeOrganization.id}/branches`);
  }

  return (
    <PlatformShell
      displayName={ctx.bundle.profile?.displayName ?? TH.common.user}
      platformRoles={ctx.bundle.platformRoles}
      organizationRoles={ctx.organizationRoles}
      organizations={ctx.bundle.memberships.map((m) => ({
        id: m.organizationId,
        name: m.organizationName,
      }))}
      branches={ctx.branches}
      activeOrganization={ctx.activeOrganization}
      activeBranch={ctx.activeBranch}
    >
      <AccessDenied title={TH.access.deniedTitle} body={TH.common.notFound} />
    </PlatformShell>
  );
}
