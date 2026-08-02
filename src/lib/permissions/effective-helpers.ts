/**
 * Pure effective-permission helpers safe for Node unit tests.
 * Keep server-only side effects out of this module.
 */

/** Union and deduplicate permission code groups (sorted). */
export function unionPermissionCodes(groups: string[][]): string[] {
  const set = new Set<string>();
  for (const group of groups) {
    for (const code of group) set.add(code);
  }
  return [...set].sort();
}

export function filterInactivePermissions(
  rows: Array<{ code: string; isActive: boolean }>,
): string[] {
  return rows.filter((r) => r.isActive).map((r) => r.code);
}
