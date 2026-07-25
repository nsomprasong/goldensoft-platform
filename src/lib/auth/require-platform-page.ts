import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { decideAccess } from "@/lib/auth/access";
import { getAuthUser } from "@/lib/auth/session";
import { loadPlatformUserBundle } from "@/lib/auth/platform-user";
import { COOKIE_NAME, decodeContextCookie } from "@/lib/context/cookie";
import { setServerTimingRoute } from "@/lib/perf/server-timing";

function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  // Never bounce bootstrap into itself.
  if (raw.startsWith("/api/")) return "/";
  return raw;
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
  const cookie = decodeContextCookie(jar.get(COOKIE_NAME)?.value);
  const headerList = await headers();
  const requestPath = safeNextPath(
    headerList.get("x-gs-pathname") ?? headerList.get("next-url"),
  );
  setServerTimingRoute(requestPath);

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
    // SUPER_ADMIN with zero memberships lands on org list instead of access wall.
    if (
      bundle.platformRoles.includes("SUPER_ADMIN") &&
      bundle.memberships.length === 0
    ) {
      // continue without active org — pages must tolerate null activeOrganization
    } else {
      redirect("/select-organization");
    }
  }

  if (decision.kind === "ready") {
    const needsOrgBootstrap =
      !cookie || cookie.organizationId !== decision.organizationId;

    if (
      needsOrgBootstrap &&
      decision.autoSelected &&
      cookie?.mode !== "platform_admin"
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

  const isSuper = bundle.platformRoles.includes("SUPER_ADMIN");
  let platformAdminOrganization: { id: string; name: string } | null = null;

  if (cookie && !membership) {
    if (!(isSuper && cookie.mode === "platform_admin" && activeOrgId)) {
      redirect("/select-organization");
    }
    const { prisma } = await import("@/lib/prisma");
    const org = await prisma.organization.findFirst({
      where: {
        id: activeOrgId,
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
      redirect("/select-organization");
    }
    platformAdminOrganization = { id: org.id, name: org.displayName };
    const adminBranch = activeBranchId
      ? (org.branches.find((b) => b.id === activeBranchId) ?? null)
      : null;
    return {
      user,
      bundle,
      activeOrganization: platformAdminOrganization,
      activeBranch: adminBranch,
      organizationRoles: [],
      branches: org.branches,
      contextMode: "platform_admin" as const,
    };
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

  return {
    user,
    bundle,
    activeOrganization: membership
      ? { id: membership.organizationId, name: membership.organizationName }
      : null,
    activeBranch,
    organizationRoles: membership?.roles ?? [],
    branches: membership?.branches ?? [],
    contextMode: (cookie?.mode ?? "membership") as
      | "membership"
      | "platform_admin",
  };
});
