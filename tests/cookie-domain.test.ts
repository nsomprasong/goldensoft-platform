import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authCookieDomain,
  withAuthCookieDomain,
} from "../src/lib/auth/cookie-domain";

describe("AUTH_COOKIE_DOMAIN", () => {
  it("accepts .parent domain only", () => {
    assert.equal(
      authCookieDomain({ AUTH_COOKIE_DOMAIN: ".goldensoft.cloud" }),
      ".goldensoft.cloud",
    );
    assert.equal(authCookieDomain({ AUTH_COOKIE_DOMAIN: "goldensoft.cloud" }), undefined);
    assert.equal(authCookieDomain({ AUTH_COOKIE_DOMAIN: "" }), undefined);
    assert.equal(authCookieDomain({}), undefined);
  });

  it("merges domain into cookie options", () => {
    const opts = withAuthCookieDomain(
      { path: "/", httpOnly: true },
      { AUTH_COOKIE_DOMAIN: ".goldensoft.cloud" },
    );
    assert.equal(opts.domain, ".goldensoft.cloud");
    assert.equal(opts.path, "/");
  });
});
