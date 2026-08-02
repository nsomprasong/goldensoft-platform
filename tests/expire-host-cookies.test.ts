import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextResponse } from "next/server";

import {
  clearSsoCookies,
  expireHostOnlyCookie,
} from "../src/lib/auth/expire-host-cookies";

describe("expire host-only cookies for AUTH_COOKIE_DOMAIN", () => {
  it("appends host-only clear after Domain write (cookies.set collapses by name)", () => {
    const prev = process.env.AUTH_COOKIE_DOMAIN;
    process.env.AUTH_COOKIE_DOMAIN = ".goldensoft.cloud";
    try {
      const res = NextResponse.next();
      res.cookies.set("sb-demo-auth-token", "value", {
        path: "/",
        domain: ".goldensoft.cloud",
      });
      expireHostOnlyCookie(res, "sb-demo-auth-token");
      const setCookies = res.headers.getSetCookie();
      assert.ok(
        setCookies.some(
          (c) =>
            c.startsWith("sb-demo-auth-token=value") &&
            c.includes("Domain=.goldensoft.cloud"),
        ),
      );
      assert.ok(
        setCookies.some(
          (c) =>
            c.startsWith("sb-demo-auth-token=") &&
            c.includes("Max-Age=0") &&
            !/Domain=/i.test(c),
        ),
      );
    } finally {
      if (prev === undefined) delete process.env.AUTH_COOKIE_DOMAIN;
      else process.env.AUTH_COOKIE_DOMAIN = prev;
    }
  });

  it("clearSsoCookies emits host-only and Domain clears", () => {
    const prev = process.env.AUTH_COOKIE_DOMAIN;
    process.env.AUTH_COOKIE_DOMAIN = ".goldensoft.cloud";
    try {
      const res = NextResponse.next();
      clearSsoCookies(res, ["gs_platform_ctx"]);
      const setCookies = res.headers.getSetCookie();
      assert.equal(setCookies.length, 2);
      assert.ok(setCookies.some((c) => !/Domain=/i.test(c)));
      assert.ok(setCookies.some((c) => /Domain=\.goldensoft\.cloud/i.test(c)));
    } finally {
      if (prev === undefined) delete process.env.AUTH_COOKIE_DOMAIN;
      else process.env.AUTH_COOKIE_DOMAIN = prev;
    }
  });
});
