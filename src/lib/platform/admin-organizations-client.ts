type OrgOption = { id: string; name: string; customerCode?: string | null };

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

let cachedManagedOrganizations: OrgOption[] | null = null;
let managedInFlight: Promise<OrgOption[]> | null = null;

/**
 * Customer organizations assigned to the current staff member via the
 * portfolio (Phase 1: staff customer-portfolio management). Dedupes
 * concurrent callers same as loadPlatformAdminOrganizations.
 */
export function loadManagedOrganizations(): Promise<OrgOption[]> {
  if (cachedManagedOrganizations) {
    return Promise.resolve(cachedManagedOrganizations);
  }
  if (managedInFlight) return managedInFlight;

  managedInFlight = fetch("/api/platform/context")
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { managedOrganizations?: OrgOption[] } | null) => {
      const rows = data?.managedOrganizations ?? [];
      cachedManagedOrganizations = rows;
      return rows;
    })
    .catch(() => [] as OrgOption[])
    .finally(() => {
      managedInFlight = null;
    });

  return managedInFlight;
}
