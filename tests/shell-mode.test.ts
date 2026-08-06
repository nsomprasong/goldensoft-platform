import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
      nav.some((item) => item.href === "http://127.0.0.1:3002/hr"),
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

  it("wires the customer app entry into PlatformShell support mode", () => {
    const source = readFileSync("src/components/platform-shell.tsx", "utf8");
    assert.match(source, /buildCustomerSupportNav/);
    assert.match(source, /item\.label === TH\.nav\.openCustomerApp/);
    assert.match(source, /customerAppHref=\{customerAppItem\?\.href \?\? null\}/);
  });
});
