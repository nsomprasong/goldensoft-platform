import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePostLoginRedirect } from "../src/lib/auth/post-login-redirect";

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
