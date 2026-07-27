import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import {
  decideAccess,
  isPlatformStaffWithoutMembershipRequirement,
} from "@/lib/auth/access";
import { getAuthUser } from "@/lib/auth/session";
import { loadPlatformUserBundle } from "@/lib/auth/platform-user";
import { COOKIE_NAME, decodeContextCookie } from "@/lib/context/cookie";
import { listActiveManagedOrganizationIds } from "@/lib/platform/customer-portfolio";
import { resolveActorPermissionCodes } from "@/lib/platform/custom-roles";
import { setServerTimingRoute } from "@/lib/perf/server-timing";

function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  // Never bounce bootstrap into itself.
  if (raw.startsWith("/api/")) return "/";
  return raw;
}

/** Cookie writes are forbidden in Server Components — clear via Route Handler. */
function redirectClearContext(nextPath: string): never {
  const params = new URLSearchParams({ next: nextPath });
  redirect(`/api/platform/context/clear?${params.toString()}`);
}

/**
 * Request-scoped so a route that resolves page context more than once (page +
 * helpers) pays for auth, profile and memberships only once.
 */
export const requirePlatformPage = cache(async function requirePlatformPage() {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  const bundle = await loadPlatformUserBundle(user.id);
  const jar = await cookies();
  let cookie = decodeContextCookie(jar.get(COOKIE_NAME)?.value);
  const headerList = await headers();
  const requestPath = safeNextPath(
    headerList.get("x-gs-pathname") ?? headerList.get("next-url"),
  );
  setServerTimingRoute(requestPath);

  const { prisma } = await import("@/lib/prisma");
  const managedOrganizationIds = bundle.profile
    ? await listActiveManagedOrganizationIds(prisma, bundle.profile.id)
    : [];

  // Drop stale context left by a previous browser user (e.g. Super Admin
  // platform_admin cookie still present when a SALES staff signs in).
  const isSuper = bundle.platformRoles.includes("SUPER_ADMIN");
  if (cookie?.mode === "platform_admin" && !isSuper) {
    redirectClearContext(requestPath);
  }
  if (
    cookie?.mode === "managed_org" &&
    !managedOrganizationIds.includes(cookie.organizationId)
  ) {
    redirectClearContext(requestPath);
  }

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
    platformRoles: bundle.platformRoles,
    managedOrganizationIds,
    contextMode: cookie?.mode,
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
    // Platform staff are not organization members. Let them into the shell when
    // there is nothing to pick yet (SUPER_ADMIN always; SALES/ACCOUNT_MANAGER
    // with an empty customer portfolio so they can create the first org).
    // Staff who already have managed customers must pick one first.
    const canContinueWithoutOrg =
      bundle.memberships.length === 0 &&
      (bundle.platformRoles.includes("SUPER_ADMIN") ||
        (isPlatformStaffWithoutMembershipRequirement(bundle.platformRoles) &&
          managedOrganizationIds.length === 0));
    if (!canContinueWithoutOrg) {
      redirect("/select-organization");
    }
  }

  if (decision.kind === "ready") {
    const needsOrgBootstrap =
      !cookie || cookie.organizationId !== decision.organizationId;

    if (
      needsOrgBootstrap &&
      decision.autoSelected &&
      cookie?.mode !== "platform_admin" &&
      cookie?.mode !== "managed_org"
    ) {
      const params = new URLSearchParams({
        organizationId: decision.organizationId,
        next: requestPath,
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

  let isManagedOrgMode =
    cookie?.mode === "managed_org" &&
    !!activeOrgId &&
    managedOrganizationIds.includes(activeOrgId);
  let platformAdminOrganization: { id: string; name: string } | null = null;

  if (cookie && !membership) {
    const canUsePlatformAdminContext =
      isSuper && cookie.mode === "platform_admin" && !!activeOrgId;

    if (!canUsePlatformAdminContext && !isManagedOrgMode) {
      // Stale membership cookie (common after inviting staff / switching users
      // on the same browser). Super Admin must reach the main shell without an
      // organization — not the org picker.
      const canEnterWithoutOrg =
        isSuper ||
        (isPlatformStaffWithoutMembershipRequirement(bundle.platformRoles) &&
          managedOrganizationIds.length === 0 &&
          bundle.memberships.length === 0);
      if (canEnterWithoutOrg) {
        redirectClearContext(requestPath);
      } else {
        redirect("/select-organization");
      }
    }
  }

  if (cookie && !membership && (isManagedOrgMode || (isSuper && cookie.mode === "platform_admin"))) {
    const org = await prisma.organization.findFirst({
      where: {
        id: activeOrgId!,
        deletedAt: null,
        status: { code: "ACTIVE" },
      },
      select: {
        id: true,
        displayName: true,
        branches: {
          where: { deletedAt: null, status: { code: "ACTIVE" } },
          select: { id: true, name: true, code: true },
          orderBy: { code: "asc" },
          take: 200,
        },
      },
    });
    if (!org) {
      // Claimed org gone — drop cookie; Super Admin continues to main.
      redirectClearContext(requestPath);
    } else {
      platformAdminOrganization = { id: org.id, name: org.displayName };
      const adminBranch = activeBranchId
        ? (org.branches.find((b) => b.id === activeBranchId) ?? null)
        : null;
      const permissionCodes = await resolveActorPermissionCodes(prisma, {
        platformRoles: bundle.platformRoles,
        organizationRoles: [],
        organizationId: org.id,
      });
      return {
        user,
        bundle,
        managedOrganizationIds,
        activeOrganization: platformAdminOrganization,
        activeBranch: adminBranch,
        organizationRoles: [],
        permissionCodes,
        branches: org.branches,
        contextMode: isManagedOrgMode
          ? ("managed_org" as const)
          : ("platform_admin" as const),
      };
    }
  }

  const activeBranch =
    membership && activeBranchId
      ? (membership.branches.find((b) => b.id === activeBranchId) ?? null)
      : null;

  if (cookie?.branchId && membership && !activeBranch) {
    const params = new URLSearchParams({
      organizationId: membership.organizationId,
      next: requestPath,
    });
    if (decision.kind === "ready" && decision.autoBranchId) {
      params.set("branchId", decision.autoBranchId);
    }
    redirect(`/api/platform/context/bootstrap?${params.toString()}`);
  }

  const organizationRoles = membership?.roles ?? [];
  const permissionCodes = await resolveActorPermissionCodes(prisma, {
    platformRoles: bundle.platformRoles,
    organizationRoles,
    organizationId: membership?.organizationId ?? null,
  });

  return {
    user,
    bundle,
    managedOrganizationIds,
    activeOrganization: membership
      ? { id: membership.organizationId, name: membership.organizationName }
      : null,
    activeBranch,
    organizationRoles,
    permissionCodes,
    branches: membership?.branches ?? [],
    contextMode: (cookie?.mode ?? "membership") as
      | "membership"
      | "platform_admin"
      | "managed_org",
  };
});
