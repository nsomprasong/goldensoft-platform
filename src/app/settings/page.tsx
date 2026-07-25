import { PlatformShell } from "@/components/platform-shell";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
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
  };

  if (!ctx.bundle.platformRoles.includes("SUPER_ADMIN")) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  return (
    <PlatformShell {...shellProps}>
      <section className="card">
        <PageHeader
          title={TH.pages.settingsTitle}
          description={TH.pages.settingsBody}
        />
      </section>
    </PlatformShell>
  );
}
