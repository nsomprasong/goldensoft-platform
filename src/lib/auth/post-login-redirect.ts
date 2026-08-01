import { filterNavForRoles, PLATFORM_NAV } from "@/lib/auth/access";
import { permissionsForRoles } from "@/lib/permissions/codes";

/**
 * Safe post-login redirects for Central Login.
 * Relative paths always allowed; absolute URLs must match CUSTOMER_APP_ORIGINS.
 */
export function resolvePostLoginRedirect(raw: string | null | undefined): string {
  const fallback = "/";
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value) return fallback;

  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fallback;
    }
    const allow = (process.env.CUSTOMER_APP_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const defaults = [
      "http://127.0.0.1:3002",
      "http://localhost:3002",
    ];
    const allowed = new Set([...defaults, ...allow]);
    if (allowed.has(url.origin)) {
      return url.toString();
    }
  } catch {
    return fallback;
  }
  return fallback;
}

/**
 * Platform staff post-login path. Absolute Customer App `next` URLs are ignored
 * so Super Admin / SALES land on Platform Admin menus, not the tenant shell.
 */
export function resolveStaffPostLoginPath(
  rawPath: string,
  input: {
    platformRoles: string[];
    organizationRoles: string[];
  },
): string {
  const path = resolveAccessiblePostLoginPath(rawPath, input);
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return "/";
  }
  return path;
}

/**
 * Drop `next` targets the signed-in user cannot open (e.g. /staff after a
 * Super Admin session expired on that URL and a SALES user signed in).
 */
export function resolveAccessiblePostLoginPath(
  rawPath: string,
  input: {
    platformRoles: string[];
    organizationRoles: string[];
  },
): string {
  const path = resolvePostLoginRedirect(rawPath);
  if (!path.startsWith("/") || path.startsWith("//")) {
    return path; // absolute customer-app URL already validated
  }
  const pathname = path.split("?")[0] ?? "/";
  if (
    pathname === "/" ||
    pathname.startsWith("/select-organization") ||
    pathname.startsWith("/organizations/new") ||
    pathname.startsWith("/access")
  ) {
    return path;
  }

  const permissions = permissionsForRoles({
    platformRoles: input.platformRoles,
    organizationRoles: input.organizationRoles,
  });
  const allowedNav = filterNavForRoles({
    platformRoles: input.platformRoles,
    organizationRoles: input.organizationRoles,
    permissions,
    items: PLATFORM_NAV,
  });

  const matched = allowedNav.some((item) => {
    if (item.href === "/") return false;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  });
  // Also allow org detail / branch paths under organizations when user can read orgs.
  if (
    !matched &&
    pathname.startsWith("/organizations/") &&
    permissions.includes("platform.organization.read")
  ) {
    return path;
  }
  return matched ? path : "/";
}
