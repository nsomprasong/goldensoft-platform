/**
 * Keep the user on the same page after org/branch switch.
 * Only rewrite when the URL embeds another organization's id
 * (e.g. /organizations/oldId/branches → /organizations/newId/branches).
 */
export function pathAfterOrganizationSwitch(
  pathname: string,
  nextOrganizationId: string,
): string | null {
  if (pathname === "/roles") {
    return `/roles?context=organization&organizationId=${encodeURIComponent(nextOrganizationId)}`;
  }
  const match = pathname.match(/^\/organizations\/([^/]+)(\/.*)?$/);
  if (!match) return null;
  const currentOrgId = match[1]!;
  if (currentOrgId === "new") return null;
  if (currentOrgId === nextOrganizationId) return null;
  const rest = match[2] ?? "";
  return `/organizations/${nextOrganizationId}${rest}`;
}
