import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isGoldenSoftPlatformStaff,
} from "../src/lib/auth/customer-app-redirect";
import { resolvePostLoginRedirect } from "../src/lib/auth/post-login-redirect";
import {
  getPreferredCustomerAppOrigin,
  pickCustomerProductHomePath,
} from "../src/lib/platform/customer-products";

describe("Customer App login redirect allowlist", () => {
  it("allows relative next paths", () => {
    assert.equal(resolvePostLoginRedirect("/auth/callback"), "/auth/callback");
    assert.equal(resolvePostLoginRedirect("/"), "/");
  });

  it("allows default customer app origins", () => {
    const next = resolvePostLoginRedirect(
      "http://127.0.0.1:3002/auth/callback?next=%2Fhr%2Femployees",
    );
    assert.match(next, /^http:\/\/127\.0\.0\.1:3002\/auth\/callback/);
  });

  it("rejects arbitrary external origins", () => {
    assert.equal(
      resolvePostLoginRedirect("https://evil.example/phish"),
      "/",
    );
  });

  it("rejects protocol-relative URLs", () => {
    assert.equal(resolvePostLoginRedirect("//evil.example"), "/");
  });
});

describe("Platform staff vs customer routing", () => {
  it("treats any platform role as GoldenSoft staff", () => {
    assert.equal(isGoldenSoftPlatformStaff(["SALES"]), true);
    assert.equal(isGoldenSoftPlatformStaff(["SUPER_ADMIN"]), true);
    assert.equal(isGoldenSoftPlatformStaff([]), false);
    assert.equal(isGoldenSoftPlatformStaff(undefined), false);
  });

  it("picks product home from entitlements", () => {
    assert.equal(
      pickCustomerProductHomePath(["resident_v2.access"]),
      "/resident",
    );
    assert.equal(
      pickCustomerProductHomePath(["hr.access", "resident_v2.access"]),
      "/",
    );
    assert.equal(pickCustomerProductHomePath([]), "/");
  });

  it("prefers CUSTOMER_APP_URL over origins list", () => {
    assert.equal(
      getPreferredCustomerAppOrigin({
        CUSTOMER_APP_URL: "http://192.168.1.10:3002/",
        CUSTOMER_APP_ORIGINS: "http://127.0.0.1:3002",
      }),
      "http://192.168.1.10:3002",
    );
  });
});
