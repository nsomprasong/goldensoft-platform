import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { PLATFORM_NAV } from "../src/lib/auth/access";
import {
  activeNavigationHrefs,
  isNavigationItemActive,
} from "../src/lib/navigation/active";

describe("Phase 6 navigation active matching", () => {
  it("activates overview only on exact root", () => {
    assert.equal(isNavigationItemActive("/", { href: "/" }), true);
    assert.equal(isNavigationItemActive("/organizations", { href: "/" }), false);
    assert.deepEqual(activeNavigationHrefs("/", PLATFORM_NAV), ["/"]);
  });

  it("activates organizations for org routes but not branch child routes", () => {
    assert.equal(
      isNavigationItemActive("/organizations", { href: "/organizations" }),
      true,
    );
    assert.equal(
      isNavigationItemActive("/organizations/new", { href: "/organizations" }),
      true,
    );
    assert.equal(
      isNavigationItemActive("/organizations/abc", { href: "/organizations" }),
      true,
    );
    assert.equal(
      isNavigationItemActive("/organizations/abc/edit", {
        href: "/organizations",
      }),
      true,
    );
    assert.equal(
      isNavigationItemActive("/organizations/abc/branches", {
        href: "/organizations",
      }),
      false,
    );
    assert.equal(
      isNavigationItemActive("/organizations/abc/branches/new", {
        href: "/organizations",
      }),
      false,
    );
    assert.equal(
      isNavigationItemActive(
        "/organizations/abc/branches/xyz/edit",
        { href: "/organizations" },
      ),
      false,
    );
  });

  it("activates branches for /branches and organization branch routes", () => {
    assert.equal(isNavigationItemActive("/branches", { href: "/branches" }), true);
    assert.equal(
      isNavigationItemActive("/organizations/abc/branches", {
        href: "/branches",
      }),
      true,
    );
    assert.equal(
      isNavigationItemActive("/organizations/abc/branches/new", {
        href: "/branches",
      }),
      true,
    );
    assert.equal(
      isNavigationItemActive(
        "/organizations/abc/branches/xyz/edit",
        { href: "/branches" },
      ),
      true,
    );
    assert.equal(
      isNavigationItemActive("/organizations/abc", { href: "/branches" }),
      false,
    );
  });

  it("activates users for invite and detail child routes", () => {
    assert.equal(isNavigationItemActive("/users", { href: "/users" }), true);
    assert.equal(
      isNavigationItemActive("/users/invite", { href: "/users" }),
      true,
    );
    assert.equal(
      isNavigationItemActive("/users/some-id", { href: "/users" }),
      true,
    );
  });

  it("keeps audit and roles scoped to their trees", () => {
    assert.equal(
      isNavigationItemActive("/roles", { href: "/roles" }),
      true,
    );
    assert.equal(
      isNavigationItemActive("/audit-logs", { href: "/audit-logs" }),
      true,
    );
    assert.equal(
      isNavigationItemActive("/organizations", { href: "/roles" }),
      false,
    );
  });

  it("never marks both organizations and branches active for the same pathname", () => {
    const paths = [
      "/organizations",
      "/organizations/new",
      "/organizations/abc",
      "/organizations/abc/edit",
      "/organizations/abc/branches",
      "/organizations/abc/branches/new",
      "/organizations/abc/branches/xyz/edit",
      "/branches",
      "/users/invite",
      "/",
    ];
    for (const pathname of paths) {
      const active = activeNavigationHrefs(pathname, PLATFORM_NAV);
      const orgAndBranch =
        active.includes("/organizations") && active.includes("/branches");
      assert.equal(
        orgAndBranch,
        false,
        `${pathname} activated both org and branch: ${active.join(",")}`,
      );
      assert.ok(active.length <= 1, `${pathname} had multiple actives: ${active.join(",")}`);
    }
  });

  it("shell uses central active matcher instead of startsWith alone", () => {
    const shell = fs.readFileSync(
      path.join(__dirname, "../src/components/app-shell.tsx"),
      "utf8",
    );
    assert.match(shell, /isNavigationItemActive/);
    assert.doesNotMatch(shell, /function isActivePath/);
    assert.match(shell, /aria-current=\{active \? "page"/);
  });
});
