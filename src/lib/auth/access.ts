import { TH } from "@/lib/i18n/th";

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

  if (activeOrgs.length === 0) {
    return {
      kind: "no_membership",
      title: TH.access.noMembershipTitle,
      body: TH.access.noMembershipBody,
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
): boolean {
  return memberships.some(
    (m) =>
      m.organizationId === organizationId && m.organizationStatus === "ACTIVE",
  );
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
};

export const PLATFORM_NAV: NavItem[] = [
  { href: "/", label: TH.nav.home },
  { href: "/organizations", label: TH.nav.organizations },
  { href: "/products", label: TH.nav.products },
  { href: "/plans", label: TH.nav.plans },
  { href: "/subscriptions", label: TH.nav.subscriptions },
];

export function filterNavForRoles(input: {
  platformRoles: string[];
  organizationRoles: string[];
  items?: NavItem[];
}): NavItem[] {
  const items = input.items ?? PLATFORM_NAV;
  const isPlatform =
    input.platformRoles.includes("SUPER_ADMIN") ||
    input.platformRoles.includes("SUPPORT") ||
    input.platformRoles.includes("BILLING_ADMIN");
  const isOrgAdmin =
    input.organizationRoles.includes("OWNER") ||
    input.organizationRoles.includes("ADMIN");

  return items.filter((item) => {
    if (item.platformOnly && !isPlatform) return false;
    if (item.href === "/subscriptions" && !isPlatform && !isOrgAdmin) {
      return false;
    }
    return true;
  });
}

export function isProtectedPath(pathname: string): boolean {
  if (pathname.startsWith("/login")) return false;
  if (pathname.startsWith("/access")) return false;
  if (pathname.startsWith("/api/health")) return false;
  if (pathname.startsWith("/_next")) return false;
  if (pathname === "/favicon.ico") return false;
  return true;
}

export function isAuthPage(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}
