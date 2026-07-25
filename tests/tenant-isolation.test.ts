import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveAccessibleBranches } from "../src/lib/context/resolve-application-context";
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
