/**
 * Keep the user on the same page after org/branch switch.
 * Only rewrite when the URL embeds another organization's id
 * (e.g. /organizations/oldId/branches → /organizations/newId/branches).
 */
export function pathAfterOrganizationSwitch(
  pathname: string,
  nextOrganizationId: string,
  options?: {
    context?: "platform" | "organization";
    branchId?: string | null;
  },
): string | null {
  const roleRoute = pathname.match(/^\/roles(?:\/(assignees|customer-assignments|customer-organizations|standard-templates))?$/);
  if (roleRoute) {
    const params = new URLSearchParams({
      context: options?.context ?? "organization",
      organizationId: nextOrganizationId,
    });
    if (options?.branchId) params.set("branchId", options.branchId);
    const platformOnlyRoleRoute = [
      "customer-assignments",
      "customer-organizations",
      "standard-templates",
    ].includes(roleRoute[1] ?? "");
    const childRoute =
      platformOnlyRoleRoute && options?.context !== "platform"
        ? ""
        : roleRoute[1]
          ? `/${roleRoute[1]}`
          : "";
    return `/roles${childRoute}?${params.toString()}`;
  }
  const match = pathname.match(/^\/organizations\/([^/]+)(\/.*)?$/);
  if (!match) return null;
  const currentOrgId = match[1]!;
  if (currentOrgId === "new") return null;
  if (currentOrgId === nextOrganizationId) return null;
  const rest = match[2] ?? "";
  return `/organizations/${nextOrganizationId}${rest}`;
}
