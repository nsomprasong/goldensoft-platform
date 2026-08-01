import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveAccessiblePostLoginPath,
  resolveStaffPostLoginPath,
} from "../src/lib/auth/post-login-redirect";

describe("resolveStaffPostLoginPath", () => {
  it("sends platform staff to Platform home when next is Customer App", () => {
    const path = resolveStaffPostLoginPath(
      "http://127.0.0.1:3002/auth/callback",
      {
        platformRoles: ["SUPER_ADMIN"],
        organizationRoles: [],
      },
    );
    assert.equal(path, "/");
  });

  it("keeps relative Platform Admin paths for staff", () => {
    const path = resolveStaffPostLoginPath("/organizations", {
      platformRoles: ["SUPER_ADMIN"],
      organizationRoles: [],
    });
    assert.equal(path, "/organizations");
  });

  it("still allows absolute Customer App next for non-staff helper", () => {
    const path = resolveAccessiblePostLoginPath(
      "http://127.0.0.1:3002/auth/callback",
      {
        platformRoles: [],
        organizationRoles: ["OWNER"],
      },
    );
    assert.equal(path, "http://127.0.0.1:3002/auth/callback");
  });
});
