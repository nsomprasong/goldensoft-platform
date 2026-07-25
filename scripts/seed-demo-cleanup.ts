/**
 * Demo dataset cleanup.
 * Usage:
 *   npm run seed:demo:cleanup -- --dry-run
 *   npm run seed:demo:cleanup
 */
export {};

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());

  const dryRun = process.argv.includes("--dry-run");

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");

  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");
  const { assertSafeEnvironment, requireSafeEnvironment } = await import(
    "../src/lib/env/guard"
  );
  const { cleanupDevelopmentDemo } = await import(
    "../src/lib/seed/demo-dataset"
  );

  const projectRoot = process.cwd();
  const guard = assertSafeEnvironment({ projectRoot });
  if (!guard.ok) {
    console.error(`[ENV_GUARD] ${guard.code}: ${guard.reason}`);
    process.exit(1);
  }
  requireSafeEnvironment({ projectRoot });

  if (process.env.NODE_ENV === "production") {
    console.error("seed:demo:cleanup forbidden in production");
    process.exit(1);
  }

  // Extra safety: require APP_ENV/NODE_ENV not production and APP_CODE present
  const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
  if (appEnv === "production" || appEnv === "prod") {
    console.error("Refusing cleanup: environment looks like production");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ต้องกำหนด DATABASE_URL ใน .env.local");
    process.exit(1);
  }

  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    projectRoot,
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 1 }));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const result = await cleanupDevelopmentDemo(prisma, { dryRun });
    console.log(dryRun ? "DRY-RUN demo cleanup counts:" : "Demo cleanup deleted:");
    console.log(JSON.stringify(result.counts, null, 2));
    if (result.organizations) {
      console.log(
        "Organizations:",
        result.organizations.map((o) => o.customerCode).join(", ") || "(none)",
      );
    }
  } finally {
    await prisma.$disconnect();
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
