/**
 * Phase 7C performance sample against a running app.
 * Records real timings. Does not disable auth checks.
 */
import { loadProjectEnv } from "./load-project-env";

loadProjectEnv(process.cwd());
process.env.ALLOW_TEST_AUTH = "true";

const BASE = process.env.ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3000";

async function createPrisma() {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");
  const projectRoot = process.cwd();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");
  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    projectRoot,
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 2 }));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return { prisma, pool };
}

async function timed(
  label: string,
  fn: () => Promise<number | void>,
): Promise<{ label: string; ms: number }> {
  const t0 = performance.now();
  await fn();
  return { label, ms: Math.round(performance.now() - t0) };
}

async function main() {
  const { prisma, pool } = await createPrisma();
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
    if (!superAdmin) throw new Error("SUPER_ADMIN missing");
    const headers = {
      "x-test-auth-user-id": superAdmin.authUserId,
      "x-test-auth-email": superAdmin.email,
    };

    const routes = [
      "/",
      "/organizations",
      "/users",
      "/roles",
      "/products",
      "/plans",
      "/subscriptions",
    ];

    const cold: Array<{ label: string; ms: number }> = [];
    for (const route of routes) {
      cold.push(
        await timed(`cold ${route}`, async () => {
          await fetch(`${BASE}${route}`, { headers, redirect: "manual" });
        }),
      );
    }

    const warm: Array<{ label: string; ms: number }> = [];
    for (const route of routes) {
      warm.push(
        await timed(`warm ${route}`, async () => {
          await fetch(`${BASE}${route}`, { headers, redirect: "manual" });
        }),
      );
    }

    const db = await timed("db subscription+history count", async () => {
      await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS c FROM platform.subscriptions`,
      );
      await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS c FROM platform.subscription_histories`,
      );
    });

    const sub = await prisma.subscription.findFirst({
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    let detail: { label: string; ms: number } | null = null;
    if (sub) {
      detail = await timed(`warm /subscriptions/${sub.id}`, async () => {
        await fetch(`${BASE}/subscriptions/${sub.id}`, {
          headers,
          redirect: "manual",
        });
      });
    }

    const report = {
      base: BASE,
      measuredAt: new Date().toISOString(),
      cold,
      warm,
      db,
      detail,
      note: "Cold includes Next compile/cache fill in development. Warm is closer to application work.",
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
