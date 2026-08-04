/**
 * Branch-scoped visibility for Platform Admin lists (users, invitations, branches).
 * When the header has an active branch, only rows that belong to that branch
 * (or ALL_BRANCHES) are shown — so data stays “ของใครของมัน”.
 */

import { MASTER } from "@/lib/platform/master-codes";

export type MembershipScopeRow = {
  scopeTypeCode: string;
  branchId: string | null;
};

export type InvitationScopeRow = {
  scopeTypeCode: string;
  branchIds: string[];
};

/** Membership is visible under a selected branch. */
export function membershipVisibleInBranch(
  scopes: readonly MembershipScopeRow[],
  branchId: string,
): boolean {
  if (!branchId) return true;
  if (scopes.length === 0) return false;
  if (
    scopes.some((s) => s.scopeTypeCode === MASTER.branchScopeType.ALL_BRANCHES)
  ) {
    return true;
  }
  return scopes.some(
    (s) =>
      s.scopeTypeCode === MASTER.branchScopeType.SELECTED &&
      s.branchId === branchId,
  );
}

/** Invitation is visible under a selected branch. */
export function invitationVisibleInBranch(
  invitation: InvitationScopeRow,
  branchId: string,
): boolean {
  if (!branchId) return true;
  if (invitation.scopeTypeCode === MASTER.branchScopeType.ALL_BRANCHES) {
    return true;
  }
  if (invitation.scopeTypeCode === MASTER.branchScopeType.SELECTED) {
    return invitation.branchIds.includes(branchId);
  }
  return false;
}

/** Human-readable branch labels for a membership's scopes. */
export function membershipBranchLabels(
  scopes: readonly MembershipScopeRow[],
  branchNameById: ReadonlyMap<string, string>,
): string {
  if (
    scopes.some((s) => s.scopeTypeCode === MASTER.branchScopeType.ALL_BRANCHES)
  ) {
    return "ทุกสาขา";
  }
  const names = scopes
    .filter(
      (s) =>
        s.scopeTypeCode === MASTER.branchScopeType.SELECTED && s.branchId,
    )
    .map((s) => branchNameById.get(s.branchId!) ?? s.branchId!)
    .filter(Boolean);
  return names.length > 0 ? [...new Set(names)].join(", ") : "—";
}

export function parseBranchIdsJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * When an active branch is selected, keep only that branch in a list.
 * When null ("ทุกสาขา"), return the full accessible list unchanged.
 */
export function filterBranchesForActiveContext<T extends { id: string }>(
  branches: readonly T[],
  activeBranchId: string | null | undefined,
): T[] {
  if (!activeBranchId) return [...branches];
  return branches.filter((row) => row.id === activeBranchId);
}
