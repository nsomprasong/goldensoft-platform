import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCustomerSupportNav,
  resolvePlatformShellMode,
} from "../src/lib/auth/shell-mode";

describe("resolvePlatformShellMode", () => {
  it("uses Platform Admin menus with no org", () => {
    assert.equal(resolvePlatformShellMode(null), "platform");
  });

  it("uses Platform Admin menus for GOLDENSOFT", () => {
    assert.equal(
      resolvePlatformShellMode({
        id: "a",
        name: "โกลเด้นซอฟต์",
        customerCode: "GOLDENSOFT",
      }),
      "platform",
    );
  });

  it("uses support menus for customer orgs", () => {
    assert.equal(
      resolvePlatformShellMode({
        id: "b",
        name: "แพลูกแพรว",
        customerCode: "TEST-PLUKPRAEW",
      }),
      "customer_support",
    );
  });
});

describe("buildCustomerSupportNav", () => {
  it("includes org overview and customer app entry for Super Admin", () => {
    const nav = buildCustomerSupportNav({
      organizationId: "org-1",
      platformRoles: ["SUPER_ADMIN"],
      organizationRoles: [],
      customerAppOrigin: "http://127.0.0.1:3002",
    });
    assert.ok(nav.some((item) => item.href === "/organizations/org-1"));
    assert.ok(
      nav.some((item) => item.href.includes("http://127.0.0.1:3002/auth/callback")),
    );
    assert.ok(!nav.some((item) => item.href === "/staff"));
  });

  it("keeps sales on org-scoped support menus", () => {
    const nav = buildCustomerSupportNav({
      organizationId: "org-2",
      platformRoles: ["SALES"],
      organizationRoles: [],
      customerAppOrigin: "http://127.0.0.1:3002",
    });
    assert.ok(nav.some((item) => item.href === "/organizations/org-2"));
    assert.ok(nav.some((item) => item.href === "/organizations/org-2/branches"));
    assert.ok(!nav.some((item) => item.href === "/settings"));
  });
});
