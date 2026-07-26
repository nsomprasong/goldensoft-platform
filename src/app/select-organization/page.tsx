import { redirect } from "next/navigation";

import { BrandLockup } from "@/components/platform-shell";
import { LogoutButton } from "@/components/logout-button";
import { OrgSelectForm } from "@/components/org-select-form";
import { decideAccess } from "@/lib/auth/access";
import { getAuthUser } from "@/lib/auth/session";
import { loadPlatformUserBundle } from "@/lib/auth/platform-user";
import { TH } from "@/lib/i18n/th";

export default async function SelectOrganizationPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const bundle = await loadPlatformUserBundle(user.id);
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

  const organizations =
    decision.kind === "select_organization" ? decision.organizations : [];

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
