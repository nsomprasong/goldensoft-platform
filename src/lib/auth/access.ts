import { TH } from "@/lib/i18n/th";
import { permissionsForRoles } from "@/lib/permissions/codes";

export type MembershipSummary = {
  organizationId: string;
  organizationName: string;
  organizationStatus: string;
  roles: string[];
  branches: Array<{ id: string; name: string; code: string }>;
};

export type ProfileAccessInput = {
  authenticated: boolean;
  profile: null | {
    statusCode: string;
    displayName: string;
    email: string;
  };
  memberships: MembershipSummary[];
  claimedOrganizationId?: string | null;
  platformRoles?: string[];
  /** Customer organizations assigned to this staff member via the portfolio (Phase 1). */
  managedOrganizationIds?: string[];
  /** Cookie mode for SUPER_ADMIN managing without membership, or staff managing a portfolio org. */
  contextMode?: "membership" | "platform_admin" | "managed_org";
};

export type AccessDecision =
  | { kind: "unauthenticated"; redirectTo: "/login" }
  | { kind: "no_profile"; title: string; body: string }
  | { kind: "profile_suspended"; title: string; body: string }
  | { kind: "no_membership"; title: string; body: string }
  | {
      kind: "select_organization";
      organizations: Array<{ id: string; name: string }>;
    }
  | {
      kind: "ready";
      organizationId: string;
      autoSelected: boolean;
      branches: Array<{ id: string; name: string; code: string }>;
      autoBranchId: string | null;
    };

export function decideAccess(input: ProfileAccessInput): AccessDecision {
  if (!input.authenticated) {
    return { kind: "unauthenticated", redirectTo: "/login" };
  }

  if (!input.profile) {
    return {
      kind: "no_profile",
      title: TH.access.noProfileTitle,
      body: TH.access.noProfileBody,
    };
  }

  if (input.profile.statusCode !== "ACTIVE") {
    return {
      kind: "profile_suspended",
      title: TH.access.suspendedTitle,
      body: TH.access.suspendedBody,
    };
  }

  const activeOrgs = input.memberships.filter(
    (m) => m.organizationStatus === "ACTIVE",
  );
  const isSuper = (input.platformRoles ?? []).includes("SUPER_ADMIN");
  const managedOrganizationIds = input.managedOrganizationIds ?? [];
  const isManagedOrgClaim =
    input.contextMode === "managed_org" &&
    !!input.claimedOrganizationId &&
    managedOrganizationIds.includes(input.claimedOrganizationId);

  if (activeOrgs.length === 0) {
    if (
      isSuper &&
      input.contextMode === "platform_admin" &&
      input.claimedOrganizationId
    ) {
      return {
        kind: "ready",
        organizationId: input.claimedOrganizationId,
        autoSelected: false,
        branches: [],
        autoBranchId: null,
      };
    }
    if (isManagedOrgClaim) {
      return {
        kind: "ready",
        organizationId: input.claimedOrganizationId!,
        autoSelected: false,
        branches: [],
        autoBranchId: null,
      };
    }
    if (isSuper || managedOrganizationIds.length > 0) {
      // SUPER_ADMIN without memberships can still use the platform shell and
      // pick an organization in platform-admin mode. Staff with a customer
      // portfolio but no memberships can pick one of their assigned orgs.
      return {
        kind: "select_organization",
        organizations: [],
      };
    }
    return {
      kind: "no_membership",
      title: TH.access.noMembershipTitle,
      body: TH.access.noMembershipBody,
    };
  }

  if (
    isSuper &&
    input.contextMode === "platform_admin" &&
    input.claimedOrganizationId &&
    !activeOrgs.some((o) => o.organizationId === input.claimedOrganizationId)
  ) {
    return {
      kind: "ready",
      organizationId: input.claimedOrganizationId,
      autoSelected: false,
      branches: [],
      autoBranchId: null,
    };
  }

  if (
    isManagedOrgClaim &&
    !activeOrgs.some((o) => o.organizationId === input.claimedOrganizationId)
  ) {
    return {
      kind: "ready",
      organizationId: input.claimedOrganizationId!,
      autoSelected: false,
      branches: [],
      autoBranchId: null,
    };
  }

  if (activeOrgs.length === 1) {
    const org = activeOrgs[0]!;
    const autoBranchId =
      org.branches.length === 1 ? org.branches[0]!.id : null;
    return {
      kind: "ready",
      organizationId: org.organizationId,
      autoSelected: true,
      branches: org.branches,
      autoBranchId,
    };
  }

  const claimed = input.claimedOrganizationId;
  if (claimed && activeOrgs.some((o) => o.organizationId === claimed)) {
    const org = activeOrgs.find((o) => o.organizationId === claimed)!;
    const autoBranchId =
      org.branches.length === 1 ? org.branches[0]!.id : null;
    return {
      kind: "ready",
      organizationId: org.organizationId,
      autoSelected: false,
      branches: org.branches,
      autoBranchId,
    };
  }

  return {
    kind: "select_organization",
    organizations: activeOrgs.map((o) => ({
      id: o.organizationId,
      name: o.organizationName,
    })),
  };
}

export function canAccessOrganization(
  memberships: MembershipSummary[],
  organizationId: string,
  options?: {
    platformRoles?: string[];
    allowPlatformAdmin?: boolean;
    managedOrganizationIds?: string[];
  },
): boolean {
  const memberOk = memberships.some(
    (m) =>
      m.organizationId === organizationId && m.organizationStatus === "ACTIVE",
  );
  if (memberOk) return true;
  if (
    options?.allowPlatformAdmin &&
    options.platformRoles?.includes("SUPER_ADMIN")
  ) {
    return true;
  }
  if (options?.managedOrganizationIds?.includes(organizationId)) {
    return true;
  }
  return false;
}

export function canAccessBranch(
  memberships: MembershipSummary[],
  organizationId: string,
  branchId: string | null,
): boolean {
  if (!canAccessOrganization(memberships, organizationId)) return false;
  if (branchId === null) return true;
  const org = memberships.find((m) => m.organizationId === organizationId);
  if (!org) return false;
  if (org.branches.length === 0) return false;
  return org.branches.some((b) => b.id === branchId);
}

export type NavItem = {
  href: string;
  label: string;
  permission?: string;
  platformOnly?: boolean;
  /** Roles allowed; empty/undefined = any authenticated with other filters. */
  anyPlatformRoles?: string[];
  anyOrgRoles?: string[];
};

export const PLATFORM_NAV: NavItem[] = [
  { href: "/", label: TH.nav.home },
  {
    href: "/organizations",
    label: TH.nav.organizations,
    permission: "platform.organization.read",
  },
  {
    href: "/branches",
    label: TH.nav.branches,
    permission: "platform.branch.read",
  },
  {
    href: "/users",
    label: TH.nav.users,
    permission: "platform.user.read",
  },
  {
    href: "/roles",
    label: TH.nav.roles,
    permission: "platform.role.read",
  },
  {
    href: "/products",
    label: TH.nav.products,
    permission: "platform.product.read",
  },
  {
    href: "/plans",
    label: TH.nav.plans,
    anyPlatformRoles: ["SUPER_ADMIN", "BILLING_ADMIN"],
    anyOrgRoles: ["OWNER", "BILLING_CONTACT"],
  },
  {
    href: "/subscriptions",
    label: TH.nav.subscriptions,
    permission: "platform.subscription.read",
  },
  {
    href: "/billing",
    label: TH.nav.billing,
    permission: "billing.account.read",
  },
  {
    href: "/audit-logs",
    label: TH.nav.auditLogs,
    permission: "platform.audit.read",
  },
  {
    href: "/staff-portfolio",
    label: TH.nav.staffPortfolio,
    anyPlatformRoles: ["SUPER_ADMIN"],
  },
  {
    href: "/settings",
    label: TH.nav.settings,
    anyPlatformRoles: ["SUPER_ADMIN"],
  },
];

export function filterNavForRoles(input: {
  platformRoles: string[];
  organizationRoles: string[];
  permissions?: string[];
  items?: NavItem[];
}): NavItem[] {
  const items = input.items ?? PLATFORM_NAV;
  const isSuper = input.platformRoles.includes("SUPER_ADMIN");
  const permissions =
    input.permissions ??
    permissionsForRoles({
      platformRoles: input.platformRoles,
      organizationRoles: input.organizationRoles,
    });

  return items.filter((item) => {
    if (isSuper) return true;

    if (item.anyPlatformRoles?.length || item.anyOrgRoles?.length) {
      const platformOk =
        item.anyPlatformRoles?.some((r) => input.platformRoles.includes(r)) ??
        false;
      const orgOk =
        item.anyOrgRoles?.some((r) => input.organizationRoles.includes(r)) ??
        false;
      if (!platformOk && !orgOk) return false;
    }

    if (item.permission && !permissions.includes(item.permission)) {
      return false;
    }

    if (item.platformOnly) {
      const isPlatform =
        input.platformRoles.includes("SUPER_ADMIN") ||
        input.platformRoles.includes("SUPPORT") ||
        input.platformRoles.includes("BILLING_ADMIN");
      if (!isPlatform) return false;
    }

    return true;
  });
}

export function isProtectedPath(pathname: string): boolean {
  if (pathname.startsWith("/login")) return false;
  if (pathname.startsWith("/auth/accept-invite")) return false;
  if (pathname.startsWith("/access")) return false;
  if (pathname.startsWith("/api/health")) return false;
  if (pathname.startsWith("/_next")) return false;
  if (pathname === "/favicon.ico") return false;
  return true;
}

export function isAuthPage(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}
