import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { decideAccess } from "@/lib/auth/access";
import { getAuthUser } from "@/lib/auth/session";
import { loadPlatformUserBundle } from "@/lib/auth/platform-user";
import { COOKIE_NAME, decodeContextCookie } from "@/lib/context/cookie";

export async function requirePlatformPage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  const bundle = await loadPlatformUserBundle(user.id);
  const jar = await cookies();
  const cookie = decodeContextCookie(jar.get(COOKIE_NAME)?.value);

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
    claimedOrganizationId: cookie?.organizationId ?? null,
  });

  if (decision.kind === "no_profile") {
    redirect("/access?reason=no_profile");
  }
  if (decision.kind === "profile_suspended") {
    redirect("/access?reason=suspended");
  }
  if (decision.kind === "no_membership") {
    redirect("/access?reason=no_membership");
  }
  if (decision.kind === "select_organization") {
    redirect("/select-organization");
  }

  if (decision.kind === "ready") {
    const needsBootstrap =
      !cookie ||
      cookie.organizationId !== decision.organizationId ||
      (decision.autoBranchId && cookie.branchId !== decision.autoBranchId);

    if (needsBootstrap && decision.autoSelected) {
      const params = new URLSearchParams({
        organizationId: decision.organizationId,
        next: "/",
      });
      if (decision.autoBranchId) {
        params.set("branchId", decision.autoBranchId);
      }
      redirect(`/api/platform/context/bootstrap?${params.toString()}`);
    }
  }

  const activeOrgId =
    decision.kind === "ready" ? decision.organizationId : cookie?.organizationId;
  const membership = bundle.memberships.find(
    (m) => m.organizationId === activeOrgId,
  );

  let activeBranchId = cookie?.branchId ?? null;
  if (decision.kind === "ready" && decision.autoBranchId && !activeBranchId) {
    activeBranchId = decision.autoBranchId;
  }

  // Tampered cookie pointing at inaccessible org
  if (cookie && !membership) {
    redirect("/select-organization");
  }

  const activeBranch =
    membership && activeBranchId
      ? (membership.branches.find((b) => b.id === activeBranchId) ?? null)
      : null;

  if (cookie?.branchId && membership && !activeBranch) {
    redirect(
      `/api/platform/context/bootstrap?organizationId=${membership.organizationId}&next=/`,
    );
  }

  return {
    user,
    bundle,
    activeOrganization: membership
      ? { id: membership.organizationId, name: membership.organizationName }
      : null,
    activeBranch,
    organizationRoles: membership?.roles ?? [],
    branches: membership?.branches ?? [],
  };
}
