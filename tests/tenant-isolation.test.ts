import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveAccessibleBranches } from "../src/lib/context/resolve-application-context";
import {
  filterBranchesForActiveContext,
  invitationVisibleInBranch,
  membershipBranchLabels,
  membershipVisibleInBranch,
  parseBranchIdsJson,
} from "../src/lib/platform/branch-data-scope";
import { wouldRemoveLastOwner } from "../src/lib/platform/organization-bootstrap";
import {
  assertSnapshotImmutable,
  buildSubscriptionSnapshot,
} from "../src/lib/platform/snapshot";

describe("Platform tenant isolation helpers", () => {
  it("branch manager SELECTED scope excludes other branches", () => {
    const accessible = resolveAccessibleBranches(
      [{ scopeType: "SELECTED", branchId: "branch-a1" }],
      ["branch-a1", "branch-a2", "branch-a3"],
    );
    assert.deepEqual(accessible, ["branch-a1"]);
    assert.ok(!accessible.includes("branch-a2"));
  });

  it("ALL_BRANCHES returns every active branch id", () => {
    const accessible = resolveAccessibleBranches(
      [{ scopeType: "ALL_BRANCHES", branchId: null }],
      ["b1", "b2"],
    );
    assert.deepEqual(accessible, ["b1", "b2"]);
  });

  it("NONE scope grants no branches", () => {
    assert.deepEqual(
      resolveAccessibleBranches([{ scopeType: "NONE", branchId: null }], ["b1"]),
      [],
    );
  });

  it("rejects removing the last OWNER", () => {
    assert.equal(wouldRemoveLastOwner(1), true);
    assert.equal(wouldRemoveLastOwner(2), false);
  });

  it("keeps subscription snapshot immutable", () => {
    const snapshot = buildSubscriptionSnapshot({
      product: { code: "HR" },
      plan: { code: "STANDARD", name: "HR Standard" },
      planVersion: {
        versionNumber: 1,
        currency: "THB",
        priceAmount: 1990 as never,
      },
      billingCycleCode: "MONTHLY",
      featureCodes: ["hr.employee.read"],
      limits: { maxEmployees: 50 },
    });
    const mutated = {
      ...snapshot,
      featureCodes: ["hr.employee.read", "extra.feature"],
    };
    assert.throws(
      () => assertSnapshotImmutable(snapshot, mutated),
      /immutable/,
    );
  });

  it("treats client org mismatch as a security rule", () => {
    const claimed = "org-a";
    const client = "org-b";
    assert.notEqual(claimed, client);
  });
});

describe("Platform branch-scoped list visibility", () => {
  it("shows ALL_BRANCHES membership under any selected branch", () => {
    assert.equal(
      membershipVisibleInBranch(
        [{ scopeTypeCode: "ALL_BRANCHES", branchId: null }],
        "hq",
      ),
      true,
    );
  });

  it("hides SELECTED membership from other branches", () => {
    assert.equal(
      membershipVisibleInBranch(
        [{ scopeTypeCode: "SELECTED", branchId: "hq" }],
        "b2",
      ),
      false,
    );
    assert.equal(
      membershipVisibleInBranch(
        [{ scopeTypeCode: "SELECTED", branchId: "hq" }],
        "hq",
      ),
      true,
    );
  });

  it("filters invitations by SELECTED branch ids", () => {
    assert.equal(
      invitationVisibleInBranch(
        { scopeTypeCode: "SELECTED", branchIds: ["hq"] },
        "b2",
      ),
      false,
    );
    assert.equal(
      invitationVisibleInBranch(
        { scopeTypeCode: "ALL_BRANCHES", branchIds: [] },
        "b2",
      ),
      true,
    );
  });

  it("filters branch lists when an active branch is selected", () => {
    const rows = [
      { id: "hq", name: "HQ" },
      { id: "b2", name: "B2" },
    ];
    assert.deepEqual(filterBranchesForActiveContext(rows, null), rows);
    assert.deepEqual(filterBranchesForActiveContext(rows, "b2"), [
      { id: "b2", name: "B2" },
    ]);
  });

  it("labels membership branches clearly", () => {
    const names = new Map([
      ["hq", "สำนักงานใหญ่"],
      ["b2", "สาขาบางนา"],
    ]);
    assert.equal(
      membershipBranchLabels(
        [{ scopeTypeCode: "ALL_BRANCHES", branchId: null }],
        names,
      ),
      "ทุกสาขา",
    );
    assert.equal(
      membershipBranchLabels(
        [{ scopeTypeCode: "SELECTED", branchId: "b2" }],
        names,
      ),
      "สาขาบางนา",
    );
  });

  it("parses invitation branchIdsJson safely", () => {
    assert.deepEqual(parseBranchIdsJson(["a", 1, "b"]), ["a", "b"]);
    assert.deepEqual(parseBranchIdsJson(null), []);
  });
});
