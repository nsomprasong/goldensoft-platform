/**
 * Platform login-test seed — org แพลูกแพรว + Auth users (password 12345678).
 *
 *   npm run seed:login-test
 *   npm run seed:login-test:cleanup
 *   npm run seed:login-test:cleanup -- --dry-run
 */
export {};

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());

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
  const { seedAllMasters } = await import("../prisma/seed-masters");
  const { seedLoginTestDataset, LOGIN_TEST_PASSWORD } = await import(
    "../src/lib/seed/login-test-dataset"
  );

  const projectRoot = process.cwd();
  const guard = assertSafeEnvironment({ projectRoot });
  if (!guard.ok) {
    console.error(`[ENV_GUARD] ${guard.code}: ${guard.reason}`);
    process.exit(1);
  }
  requireSafeEnvironment({ projectRoot });

  if (process.env.NODE_ENV === "production") {
    console.error("seed:login-test forbidden in production");
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
    console.log("Seeding login-test tenant (แพลูกแพรว) + Auth users…");
    await seedAllMasters(prisma);
    const result = await seedLoginTestDataset(prisma);
    console.log(
      JSON.stringify(
        {
          organization: {
            id: result.organizationId,
            code: result.organizationCode,
            name: result.organizationName,
          },
          branches: result.branches,
          password: LOGIN_TEST_PASSWORD,
          users: result.users.map((u) => ({
            email: u.email,
            displayName: u.displayName,
            orgRole: u.orgRole,
            branchCode: u.branchCode,
            employeeCode: u.employeeCode,
            scenario: u.scenario,
          })),
        },
        null,
        2,
      ),
    );
    console.log(
      "\nNext: cd ../goldensoft-hr && npm run seed:login-test\nLogin: http://localhost:3000/login",
    );
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
