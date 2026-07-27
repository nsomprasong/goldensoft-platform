/**
 * Purge tenant/business data and keep only an allow-list of accounts and
 * organizations. Master + catalog data (statuses, roles, permissions, products,
 * plans) is never touched, and Supabase Auth users are left alone.
 *
 * Usage:
 *   npm run purge:tenant-data                       # dry-run report (default)
 *   $env:PURGE_CONFIRM='PURGE_TENANT_DATA'; npm run purge:tenant-data -- --apply
 *
 * Options (env):
 *   PURGE_KEEP_EMAILS    default: nsomprasong@gmail.com
 *   PURGE_KEEP_ORG_CODES default: GOLDENSOFT   (use "none" to keep no organization)
 */
export {};

const CONFIRM_VALUE = "PURGE_TENANT_DATA";

function parseList(raw: string | undefined, fallback: readonly string[]): string[] {
  if (raw === undefined) return [...fallback];
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return [];
  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());

  const apply = process.argv.includes("--apply");

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
  const {
    DEFAULT_KEEP_EMAILS,
    DEFAULT_KEEP_ORGANIZATION_CODES,
    planPurge,
    purgeData,
  } = await import("../src/lib/seed/purge-dataset");

  const projectRoot = process.cwd();
  const guard = assertSafeEnvironment({ projectRoot });
  if (!guard.ok) {
    console.error(`[ENV_GUARD] ${guard.code}: ${guard.reason}`);
    process.exit(1);
  }
  requireSafeEnvironment({ projectRoot });

  const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
  if (appEnv === "production" || appEnv === "prod") {
    console.error("Refusing purge: environment looks like production");
    process.exit(1);
  }

  if (apply && process.env.PURGE_CONFIRM !== CONFIRM_VALUE) {
    console.error(
      `ต้องกำหนด PURGE_CONFIRM=${CONFIRM_VALUE} เพื่อยืนยันการลบข้อมูลจริง`,
    );
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ต้องกำหนด DATABASE_URL ใน .env.local");
    process.exit(1);
  }

  const options = {
    keepEmails: parseList(process.env.PURGE_KEEP_EMAILS, DEFAULT_KEEP_EMAILS),
    keepOrganizationCodes: parseList(
      process.env.PURGE_KEEP_ORG_CODES,
      DEFAULT_KEEP_ORGANIZATION_CODES,
    ),
  };

  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    projectRoot,
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 1 }));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const plan = apply
      ? (await purgeData(prisma, options)).plan
      : await planPurge(prisma, options);

    console.log(apply ? "PURGED (applied):" : "DRY-RUN (ยังไม่ลบข้อมูล):");
    console.log(
      "  เก็บบัญชี:",
      plan.keptProfiles.map((profile) => profile.email).join(", ") || "(none)",
    );
    console.log(
      "  เก็บองค์กร:",
      plan.keptOrganizations.map((org) => org.customerCode).join(", ") ||
        "(none)",
    );
    console.log(
      "  ลบองค์กร:",
      plan.organizations.map((org) => org.customerCode).join(", ") || "(none)",
    );
    console.log(
      "  ลบบัญชี:",
      plan.profiles.map((profile) => profile.email).join(", ") || "(none)",
    );
    console.log(JSON.stringify(plan.counts, null, 2));
    if (!apply) {
      console.log(
        `\nรันจริงด้วย: PURGE_CONFIRM=${CONFIRM_VALUE} npm run purge:tenant-data -- --apply`,
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
