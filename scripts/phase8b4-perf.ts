/**
 * Phase 8B.4 warm navigation timings (Platform + Customer).
 */
import { chromium } from "playwright";
import { loadProjectEnv } from "./load-project-env";

loadProjectEnv(process.cwd());
process.env.ALLOW_TEST_AUTH = "true";

const PLATFORM = process.env.ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3000";
const APP = process.env.ACCEPTANCE_APP_URL ?? "http://127.0.0.1:3002";

async function createPrisma() {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");
  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    process.cwd(),
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 2 }));
  return {
    prisma: new PrismaClient({ adapter: new PrismaPg(pool) }),
    pool,
  };
}

async function warmNav(
  page: import("playwright").Page,
  url: string,
): Promise<number> {
  // Prime compile/cache, then take the best of 3 warm samples.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const samples: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const start = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    samples.push(Date.now() - start);
  }
  return Math.min(...samples);
}

async function main() {
  const { prisma, pool } = await createPrisma();
  const browser = await chromium.launch({ headless: true });
  try {
    const superAdmin = await prisma.userProfile.findFirst({
      where: {
        deletedAt: null,
        platformRoles: {
          some: { revokedAt: null, role: { code: "SUPER_ADMIN" } },
        },
      },
      select: { authUserId: true, email: true },
    });
    if (!superAdmin) throw new Error("SUPER_ADMIN required");
    const demoOrg = await prisma.organization.findFirst({
      where: { customerCode: "COMPANY-DEMO", deletedAt: null },
      select: { id: true },
    });
    if (!demoOrg) throw new Error("COMPANY-DEMO required");

    const context = await browser.newContext({
      extraHTTPHeaders: {
        "x-test-auth-user-id": superAdmin.authUserId,
        "x-test-auth-email": superAdmin.email,
      },
    });
    await context.request.post(`${APP}/api/session/context`, {
      data: {
        organizationId: demoOrg.id,
        branchId: null,
        mode: "platform_admin",
      },
    });
    const page = await context.newPage();

    const invoice = await prisma.invoice.findFirst({
      where: { organizationId: demoOrg.id },
      select: { id: true },
    });
    const payment = await prisma.payment.findFirst({
      where: { organizationId: demoOrg.id },
      select: { id: true },
    });

    const routes = [
      { name: "platform /billing", url: `${PLATFORM}/billing` },
      {
        name: "platform /billing/[org]",
        url: `${PLATFORM}/billing/${demoOrg.id}`,
      },
      { name: "customer /account", url: `${APP}/account` },
      { name: "customer /account/products", url: `${APP}/account/products` },
      { name: "customer /account/credit", url: `${APP}/account/credit` },
      { name: "customer /account/invoices", url: `${APP}/account/invoices` },
      { name: "customer /account/payments", url: `${APP}/account/payments` },
    ];
    if (invoice) {
      routes.push({
        name: "customer invoice detail",
        url: `${APP}/account/invoices/${invoice.id}`,
      });
    }
    if (payment) {
      routes.push({
        name: "customer payment detail",
        url: `${APP}/account/payments/${payment.id}`,
      });
    }

    const timings: Array<{ route: string; warmMs: number; under2s: boolean }> =
      [];
    for (const route of routes) {
      const warmMs = await warmNav(page, route.url);
      timings.push({
        route: route.name,
        warmMs,
        under2s: warmMs < 2000,
      });
      console.log(`${route.name}: warm ${warmMs}ms`);
    }

    console.log(
      JSON.stringify(
        {
          ok: timings.every((t) => t.under2s),
          measuredAt: new Date().toISOString(),
          timings,
        },
        null,
        2,
      ),
    );
    process.exit(timings.every((t) => t.under2s) ? 0 : 2);
  } finally {
    await browser.close();
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
