/**
 * Phase 7 seed entrypoint.
 *
 * SEED_MODE=system                 → masters + permission catalog only
 * SEED_MODE=development-demo       → system + labeled demo tenants (never production)
 * SEED_MODE=production-bootstrap   → system + approved real bootstrap only
 *
 * Does not send real invites. Does not create real Auth users from demo data.
 *
 * Environment must load before any module that reads process.env / PrismaClient.
 */
export {};

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");

  const { seedAllMasters } = await import("../prisma/seed-masters");
  const { resolveSeedMode } = await import("../src/lib/seed/seed-mode");
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");
  const { assertSafeEnvironment, requireSafeEnvironment } = await import(
    "../src/lib/env/guard"
  );

  const projectRoot = process.cwd();
  const guard = assertSafeEnvironment({ projectRoot });
  if (!guard.ok) {
    console.error(`[ENV_GUARD] ${guard.code}: ${guard.reason}`);
    process.exit(1);
  }
  requireSafeEnvironment({ projectRoot });

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
    const mode = resolveSeedMode();
    console.log(`Seeding mode=${mode}`);
    await seedAllMasters(prisma);
    console.log("System masters upserted");

    if (mode === "development-demo") {
      const { seedDevelopmentDemo } = await import(
        "../src/lib/seed/demo-dataset"
      );
      const result = await seedDevelopmentDemo(prisma);
      console.log("Demo organizations:", result.organizations.join(", "));
    }

    if (mode === "production-bootstrap") {
      console.log(
        "Production bootstrap runs only with explicit operator approval — no demo tenants.",
      );
    }
  } finally {
    await prisma.$disconnect();
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    message
      .replace(/:[^:@/]+@/g, ":***@")
      .replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g, "[redacted-pem]"),
  );
  process.exit(1);
});
