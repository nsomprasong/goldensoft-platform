import { redirect } from "next/navigation";

import { BrandLockup } from "@/components/platform-shell";
import { LogoutButton } from "@/components/logout-button";
import { OrgSelectForm } from "@/components/org-select-form";
import { decideAccess } from "@/lib/auth/access";
import { getAuthUser } from "@/lib/auth/session";
import { loadPlatformUserBundle } from "@/lib/auth/platform-user";
import { TH } from "@/lib/i18n/th";
import { listActiveManagedOrganizationIds } from "@/lib/platform/customer-portfolio";
import { prisma } from "@/lib/prisma";

export default async function SelectOrganizationPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const bundle = await loadPlatformUserBundle(user.id);
  const managedOrganizationIds = bundle.profile
    ? await listActiveManagedOrganizationIds(prisma, bundle.profile.id)
    : [];

  const decision = decideAccess({
    authenticated: true,
    profile: bundle.profile
      ? {
          statusCode: bundle.profile.statusCode,
          displayName: bundle.profile.displayName,
          email: bundle.profile.email,
        }
      : null,
    memberships: bundle.memberships,
    platformRoles: bundle.platformRoles,
    managedOrganizationIds,
  });

  if (decision.kind === "no_profile") redirect("/access?reason=no_profile");
  if (decision.kind === "profile_suspended") {
    redirect("/access?reason=suspended");
  }
  if (decision.kind === "no_membership") {
    redirect("/access?reason=no_membership");
  }
  if (decision.kind === "ready") {
    redirect("/");
  }

  const membershipOrgs =
    decision.kind === "select_organization" ? decision.organizations : [];

  // Portfolio staff pick from managed customer orgs (they are not members).
  let organizations = membershipOrgs;
  if (organizations.length === 0 && managedOrganizationIds.length > 0) {
    const managed = await prisma.organization.findMany({
      where: {
        id: { in: managedOrganizationIds },
        deletedAt: null,
        status: { code: "ACTIVE" },
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    });
    organizations = managed.map((org) => ({
      id: org.id,
      name: org.displayName,
    }));
  }

  // Super Admin does not need an organization to use Platform Admin.
  if (
    organizations.length === 0 &&
    bundle.platformRoles.includes("SUPER_ADMIN")
  ) {
    redirect("/");
  }

  return (
    <div className="auth-shell">
      <section className="auth-card !max-w-xl">
        <BrandLockup subtitle={TH.shellName} />
        <h1 className="mt-5 text-[length:var(--text-page)] font-semibold">
          {TH.pages.selectOrgTitle}
        </h1>
        <p className="mt-2 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
          {TH.pages.selectOrgBody}
        </p>
        <OrgSelectForm organizations={organizations} />
        <div className="mt-6">
          <LogoutButton appearance="text" />
        </div>
      </section>
    </div>
  );
}
