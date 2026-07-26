type OrgOption = { id: string; name: string };

let cachedAdminOrganizations: OrgOption[] | null = null;
let inFlight: Promise<OrgOption[]> | null = null;

/**
 * Shared client fetch for SUPER_ADMIN org list.
 * Dedupes concurrent callers (two ContextSwitchers + React Strict Mode).
 */
export function loadPlatformAdminOrganizations(): Promise<OrgOption[]> {
  if (cachedAdminOrganizations) {
    return Promise.resolve(cachedAdminOrganizations);
  }
  if (inFlight) return inFlight;

  inFlight = fetch("/api/platform/context")
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { platformAdminOrganizations?: OrgOption[] } | null) => {
      const rows = data?.platformAdminOrganizations ?? [];
      cachedAdminOrganizations = rows;
      return rows;
    })
    .catch(() => [] as OrgOption[])
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
