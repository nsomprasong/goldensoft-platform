import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.resolve(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

describe("Phase 7 request-scoped context", () => {
  it("resolves auth, bundle, actor and page context once per request", () => {
    const session = read("src/lib/auth/session.ts");
    const bundle = read("src/lib/auth/platform-user.ts");
    const actor = read("src/lib/auth/actor-access.ts");
    const guard = read("src/lib/auth/require-platform-page.ts");

    for (const [file, source] of [
      ["session.ts", session],
      ["platform-user.ts", bundle],
      ["actor-access.ts", actor],
      ["require-platform-page.ts", guard],
    ] as const) {
      assert.match(source, /import \{ cache \} from "react"/, file);
    }

    assert.match(session, /const resolveAuthUser = cache\(/);
    assert.match(bundle, /export const loadPlatformUserBundle = cache\(/);
    assert.match(actor, /export const loadActorAccess = cache\(/);
    assert.match(guard, /export const requirePlatformPage = cache\(/);
  });

  it("keeps the request cache request-scoped and never global", () => {
    for (const file of [
      "src/lib/auth/session.ts",
      "src/lib/auth/platform-user.ts",
      "src/lib/auth/actor-access.ts",
      "src/lib/auth/require-platform-page.ts",
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /globalThis\.[A-Za-z]*[Cc]ache/, file);
      assert.doesNotMatch(source, /unstable_cache|revalidate:/, file);
      assert.doesNotMatch(source, /new Map\(\)\s*;?\s*$/m, file);
    }
  });

  it("still enforces the same auth and access decisions", () => {
    const guard = read("src/lib/auth/require-platform-page.ts");
    assert.match(guard, /if \(!user\) \{\s*redirect\("\/login"\)/);
    assert.match(guard, /decideAccess\(/);
    assert.match(guard, /redirect\("\/access\?reason=no_profile"\)/);
    assert.match(guard, /redirect\("\/access\?reason=suspended"\)/);
    assert.match(guard, /redirect\("\/access\?reason=no_membership"\)/);
    assert.match(guard, /redirect\("\/select-organization"\)/);
  });
});

describe("Phase 7 database round trips", () => {
  it("loads branch scopes without a query per membership", () => {
    const bundle = read("src/lib/auth/platform-user.ts");
    assert.match(bundle, /organizationId: \{ in: allBranchOrganizationIds \}/);
    const loops = bundle.match(/for \([\s\S]*?\n  \}/g) ?? [];
    for (const loop of loops) {
      assert.doesNotMatch(loop, /await prisma\./);
    }
    assert.match(bundle, /getActiveStatusIds/);
    assert.match(bundle, /Promise\.all\(\[/);
    assert.match(
      read("src/lib/platform/master-ids.ts"),
      /await Promise\.all\(\[/,
    );
  });

  it("uses a short TTL bundle cache outside the request scope helper", () => {
    assert.ok(exists("src/lib/auth/platform-user-cache.ts"));
    const cache = read("src/lib/auth/platform-user-cache.ts");
    assert.match(cache, /TTL_MS = 30_000/);
    assert.match(read("src/lib/auth/platform-user.ts"), /readPlatformUserBundleCache/);
  });

  it("reuses the platform user bundle for actor access", () => {
    const actor = read("src/lib/auth/actor-access.ts");
    assert.match(actor, /loadPlatformUserBundle\(authUserId\)/);
    assert.doesNotMatch(actor, /userProfile\.findUnique/);
  });

  it("reuses middleware-authenticated identity instead of a second getUser", () => {
    const session = read("src/lib/auth/session.ts");
    const middleware = read("middleware.ts");
    assert.match(middleware, /MIDDLEWARE_AUTH_USER_HEADER/);
    assert.match(middleware, /requestHeaders\.delete\(MIDDLEWARE_AUTH_USER_HEADER\)/);
    assert.match(session, /middlewareAuthUserId/);
  });

  it("avoids getUser on every middleware hit when the session is fresh", () => {
    const supabaseMw = read("src/lib/supabase/middleware.ts");
    assert.match(supabaseMw, /getSession\(\)/);
    assert.match(supabaseMw, /REFRESH_WINDOW_MS/);
    assert.match(supabaseMw, /getUser\(\)/);
  });

  it("fetches independent page data with Promise.all", () => {
    for (const file of [
      "src/app/page.tsx",
      "src/app/users/page.tsx",
      "src/app/audit-logs/page.tsx",
      "src/app/organizations/[id]/page.tsx",
    ]) {
      assert.match(read(file), /Promise\.all\(\[/, file);
    }
  });

  it("bounds every admin list query", () => {
    const bounded: Array<[string, RegExp]> = [
      ["src/app/subscriptions/page.tsx", /take: 100/],
      ["src/app/products/page.tsx", /take: 100/],
      ["src/app/plans/page.tsx", /take: 100/],
      ["src/app/users/page.tsx", /take: 50/],
      ["src/app/audit-logs/page.tsx", /take,/],
      ["src/app/organizations/[id]/page.tsx", /take: 200/],
    ];
    for (const [file, pattern] of bounded) {
      assert.match(read(file), pattern, file);
    }
  });

  it("does not query the database inside loops on key routes", () => {
    for (const file of [
      "src/app/page.tsx",
      "src/app/organizations/page.tsx",
      "src/app/users/page.tsx",
      "src/app/audit-logs/page.tsx",
    ]) {
      const source = read(file);
      const loops = source.match(/(?:for \(|\.map\(|\.forEach\()[\s\S]{0,400}/g) ?? [];
      for (const loop of loops) {
        assert.doesNotMatch(loop, /await prisma\./, file);
      }
    }
    // Profile admin loads roles in one batched query (not per membership).
    assert.match(
      read("src/app/users/profiles/[id]/page.tsx"),
      /organizationId: \{ in: orgIdsForRoles \}/,
    );
  });
});

describe("Phase 7 middleware and shell", () => {
  it("keeps middleware to session refresh and routing only", () => {
    const middleware = read("middleware.ts");
    assert.doesNotMatch(middleware, /@\/lib\/prisma|prisma\./);
    assert.doesNotMatch(middleware, /loadPlatformUserBundle|loadActorAccess/);
    assert.match(middleware, /updateSession\(request\)/);
  });

  it("excludes static assets from the middleware matcher", () => {
    const matcher = read("middleware.ts").match(/matcher: \[([\s\S]*?)\]/)?.[1];
    assert.ok(matcher);
    for (const asset of [
      "_next/static",
      "_next/image",
      "favicon.ico",
      "woff2",
      "css",
      "svg",
    ]) {
      assert.ok(matcher.includes(asset), asset);
    }
  });

  it("renders header and sidebar from props without database access", () => {
    for (const file of [
      "src/components/platform-shell.tsx",
      "src/components/app-shell.tsx",
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /@\/lib\/prisma/, file);
      assert.doesNotMatch(
        source,
        /requirePlatformPage|loadPlatformUserBundle|loadActorAccess|getAuthUser/,
        file,
      );
    }
  });

  it("keeps a single root layout without per-request data loading", () => {
    const layout = read("src/app/layout.tsx");
    assert.doesNotMatch(layout, /@\/lib\/prisma|requirePlatformPage|getAuthUser/);
    assert.match(layout, /NavigationPending/);
  });
});

describe("Phase 7 instrumentation and loading UX", () => {
  it("gates server timing to development and logs no identifiers", () => {
    const perf = read("src/lib/perf/server-timing.ts");
    assert.match(perf, /process\.env\.NODE_ENV === "development"/);
    assert.match(perf, /process\.env\.PERF_LOG === "true"/);
    const logged = perf.match(/console\.info\(([\s\S]*?)\);/)?.[1];
    assert.ok(logged);
    assert.match(logged, /\[PERF\] route=\$\{bucket\.route\}/);
    assert.doesNotMatch(
      logged,
      /email|token|authUserId|userId|connectionString|secret|cookie/i,
    );
    assert.match(perf, /pathname\.split\("\?"\)\[0\]/);
  });

  it("provides route-level loading UI for the heaviest pages", () => {
    for (const file of [
      "src/app/loading.tsx",
      "src/app/organizations/loading.tsx",
      "src/app/users/loading.tsx",
      "src/app/audit-logs/loading.tsx",
    ]) {
      assert.ok(exists(file), file);
    }
    assert.match(read("src/components/ui/page-skeleton.tsx"), /role="status"/);
  });
});
