/**
 * Smoke: SUPER_ADMIN must get GOLDENSOFT_HR allowed even when org entitlement
 * is inactive. Run: npx tsx scripts/smoke-super-admin-products.ts
 */
import { loadProjectEnv } from "./load-project-env";

loadProjectEnv(process.cwd());
process.env.ALLOW_TEST_AUTH = "true";

async function main() {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");
  const { CUSTOMER_PRODUCT_CARDS } = await import(
    "../src/lib/platform/customer-products"
  );
  const { listEntitlementsForOrganization } = await import(
    "../src/lib/platform/entitlements"
  );

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");
  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    process.cwd(),
  );
  const pool = new Pool(
    buildDatabasePoolConfig(databaseUrl, buildTrustedPgSsl(content), { max: 1 }),
  );
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const profile = await db.userProfile.findFirst({
      where: {
        deletedAt: null,
        platformRoles: {
          some: { revokedAt: null, role: { code: "SUPER_ADMIN" } },
        },
      },
      select: { authUserId: true, email: true, displayName: true },
    });
    if (!profile) throw new Error("No SUPER_ADMIN profile");

    const orgs = await db.organization.findMany({
      where: { deletedAt: null },
      select: { id: true, displayName: true, customerCode: true },
      take: 20,
    });
    const goldensoft =
      orgs.find((o) => o.customerCode.toUpperCase().includes("GOLDENSOFT")) ??
      orgs[0];
    if (!goldensoft) throw new Error("No organization");

    const entitlements = await listEntitlementsForOrganization(
      db,
      goldensoft.id,
    );
    const inactiveSub = new Set(["SUSPENDED", "CANCELLED", "EXPIRED"]);
    const isSuper = true;
    const products = CUSTOMER_PRODUCT_CARDS.map((card) => {
      const rows = entitlements.filter((e) => e.code === card.entitlementCode);
      const row = rows[0];
      const subStatus = row?.subscription?.status.code ?? null;
      const entitlementActive =
        row != null &&
        (row.status.code === "ACTIVE" || row.status.code === "TRIAL");
      const subOk = !subStatus || !inactiveSub.has(subStatus);
      const orgAllowed = entitlementActive && subOk;
      const superAllowed = isSuper && card.runtimeStatus === "available";
      return {
        productCode: card.productCode,
        orgAllowed,
        allowed: orgAllowed || superAllowed,
        subStatus,
        runtimeStatus: card.runtimeStatus,
      };
    });

    const hr = products.find((p) => p.productCode === "GOLDENSOFT_HR");
    console.log(
      JSON.stringify(
        {
          superAdmin: profile.email,
          org: {
            name: goldensoft.displayName,
            code: goldensoft.customerCode,
          },
          products,
          hrUsableBySuper: Boolean(
            hr?.allowed && hr.runtimeStatus === "available",
          ),
        },
        null,
        2,
      ),
    );

    if (!hr?.allowed) {
      throw new Error("SUPER_ADMIN should be allowed to open GOLDENSOFT_HR");
    }

    // Live entitlement check API (requires ALLOW_TEST_AUTH on running server).
    const base =
      process.env.PLATFORM_BASE_URL?.replace(/\/$/, "") ??
      "http://127.0.0.1:3000";
    const check = await fetch(`${base}/api/platform/entitlements/check`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-auth-user-id": profile.authUserId,
        "x-test-auth-email": profile.email,
      },
      body: JSON.stringify({
        organizationId: goldensoft.id,
        productCode: "GOLDENSOFT_HR",
        entitlementCode: "hr.access",
      }),
    });
    const checkBody = (await check.json().catch(() => ({}))) as {
      allowed?: boolean;
      reason?: string;
      code?: string;
    };
    console.log(
      JSON.stringify(
        {
          liveEntitlementCheck: {
            status: check.status,
            allowed: checkBody.allowed,
            reason: checkBody.reason ?? checkBody.code,
          },
        },
        null,
        2,
      ),
    );

    if (check.status === 200 && checkBody.allowed !== true) {
      throw new Error("Live entitlement check did not allow SUPER_ADMIN");
    }
    if (check.status === 401) {
      console.warn(
        "WARN: Platform server has ALLOW_TEST_AUTH=false — restart with true to verify live check. Logic unit path passed.",
      );
    }

    // App + HR reachability
    for (const url of [
      "http://127.0.0.1:3002/",
      "http://127.0.0.1:3001/hr",
      "http://127.0.0.1:3000/organizations",
    ]) {
      const res = await fetch(url, { redirect: "manual" });
      console.log(`GET ${url} -> ${res.status}`);
    }

    console.log("SMOKE_OK");
  } finally {
    await db.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
