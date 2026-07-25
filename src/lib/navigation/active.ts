/**
 * Central navigation active-state matching for the platform shell.
 * Prefer include/exclude rules over naive pathname.startsWith(href).
 */

export type NavigationActiveItem = {
  href: string;
  exact?: boolean;
  /** When set, pathname must match at least one pattern (after excludes). */
  include?: Array<string | RegExp>;
  /** When matched, item is never active. */
  exclude?: Array<string | RegExp>;
};

function toRegExp(pattern: string | RegExp): RegExp {
  if (pattern instanceof RegExp) return pattern;
  // Treat plain strings as prefix matches unless they look like full paths with anchors.
  if (pattern.startsWith("^") || pattern.includes(".*")) {
    return new RegExp(pattern);
  }
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}(?:/|$)`);
}

function matchesAny(
  pathname: string,
  patterns: Array<string | RegExp> | undefined,
): boolean {
  if (!patterns?.length) return false;
  return patterns.some((pattern) => toRegExp(pattern).test(pathname));
}

/** Default active rules keyed by nav href — mutually exclusive for org vs branch. */
export const NAV_ACTIVE_RULES: Record<
  string,
  Omit<NavigationActiveItem, "href">
> = {
  "/": { exact: true },
  "/organizations": {
    include: [
      /^\/organizations$/,
      /^\/organizations\/new$/,
      /^\/organizations\/[^/]+$/,
      /^\/organizations\/[^/]+\/edit$/,
    ],
    exclude: [/^\/organizations\/[^/]+\/branches(\/|$)/],
  },
  "/branches": {
    include: [
      /^\/branches$/,
      /^\/branches\//,
      /^\/organizations\/[^/]+\/branches(\/|$)/,
    ],
  },
  "/users": {
    include: [/^\/users(\/|$)/],
  },
  "/roles": {
    include: [/^\/roles(\/|$)/],
  },
  "/products": {
    include: [/^\/products(\/|$)/],
  },
  "/plans": {
    include: [/^\/plans(\/|$)/],
  },
  "/subscriptions": {
    include: [/^\/subscriptions(\/|$)/],
  },
  "/audit-logs": {
    include: [/^\/audit-logs(\/|$)/],
  },
  "/settings": {
    include: [/^\/settings(\/|$)/],
  },
};

export function resolveNavigationActiveItem(
  item: NavigationActiveItem | { href: string },
): NavigationActiveItem {
  const defaults = NAV_ACTIVE_RULES[item.href] ?? {};
  return {
    href: item.href,
    exact: "exact" in item && item.exact !== undefined ? item.exact : defaults.exact,
    include:
      "include" in item && item.include !== undefined
        ? item.include
        : defaults.include,
    exclude:
      "exclude" in item && item.exclude !== undefined
        ? item.exclude
        : defaults.exclude,
  };
}

/**
 * Returns whether a navigation item should be marked active for the pathname.
 */
export function isNavigationItemActive(
  pathname: string,
  item: NavigationActiveItem | { href: string },
): boolean {
  const rule = resolveNavigationActiveItem(item);

  if (matchesAny(pathname, rule.exclude)) {
    return false;
  }

  if (rule.exact) {
    return pathname === rule.href;
  }

  if (rule.include?.length) {
    return matchesAny(pathname, rule.include);
  }

  // Fallback: exact or child path under href (never for bare "/").
  if (rule.href === "/") {
    return pathname === "/";
  }
  return pathname === rule.href || pathname.startsWith(`${rule.href}/`);
}

/** Active hrefs among a nav list — useful for uniqueness assertions. */
export function activeNavigationHrefs(
  pathname: string,
  items: Array<{ href: string }>,
): string[] {
  return items
    .filter((item) => isNavigationItemActive(pathname, item))
    .map((item) => item.href);
}
