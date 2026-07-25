/**
 * Bootstrap first platform super admin (Preview + Confirm).
 *
 * Environment must load before any module that reads process.env.
 * Auth Admin lookup uses REST fetch only — never createClient / Realtime.
 */
export {};

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");

  const {
    BootstrapError,
    BOOTSTRAP_CONFIRM_VALUE,
    bootstrapFirstSuperAdmin,
    fetchAuthAdminUserById,
    formatAuthLookupDiagnostic,
    formatPreviewThai,
    hasBootstrapConfirmation,
    parseBootstrapEnv,
  } = await import("../src/lib/auth/bootstrap-first-admin");
  type BootstrapAuthUser = import("../src/lib/auth/bootstrap-first-admin").BootstrapAuthUser;
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

  let input;
  try {
    input = parseBootstrapEnv(process.env);
  } catch (error) {
    const message =
      error instanceof BootstrapError
        ? error.message
        : "ค่า environment ไม่ถูกต้อง";
    console.error(message);
    process.exit(1);
  }

  const projectRef = guard.projectRef ?? "unknown";
  const authOutcome = await fetchAuthAdminUserById({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    secretKey: process.env.SUPABASE_SECRET_KEY ?? "",
    authUserId: input.authUserId,
    adminEmail: input.adminEmail,
  });
  if (!authOutcome.ok) {
    for (const line of formatAuthLookupDiagnostic(authOutcome, {
      projectRef,
      authUserId: input.authUserId,
      adminEmail: input.adminEmail,
    })) {
      console.error(line);
    }
    process.exit(1);
  }
  const authUser: BootstrapAuthUser = authOutcome.user;

  const confirmed = hasBootstrapConfirmation(input.confirm);
  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH,
    projectRoot,
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 1 }));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const result = await bootstrapFirstSuperAdmin({
      db: prisma,
      projectRef,
      input,
      authUser,
      dryRun: !confirmed,
    });

    for (const line of formatPreviewThai(result.preview)) {
      console.log(line);
    }

    if (!confirmed) {
      console.log(
        `ต้องการยืนยัน: BOOTSTRAP_CONFIRM=${BOOTSTRAP_CONFIRM_VALUE}`,
      );
      process.exit(1);
    }

    console.log("สร้างผู้ดูแลระบบสูงสุดสำเร็จ");
    console.log("จำนวนที่สร้างใหม่:", {
      โปรไฟล์: result.counts.profilesCreated,
      บทบาทแพลตฟอร์ม: result.counts.platformRolesCreated,
      สมาชิกองค์กร: result.counts.membershipsCreated,
      บทบาทองค์กร: result.counts.membershipRolesCreated,
      สิทธิ์สาขา: result.counts.branchScopesCreated,
      audit: result.counts.auditsCreated,
      ใช้ซ้ำ: result.counts.reused,
    });
    console.log("โปรไฟล์:", result.maskedProfileId);
    console.log("องค์กร:", result.maskedOrganizationId);
    console.log("สาขา:", result.maskedBranchId);
  } catch (error) {
    const message =
      error instanceof BootstrapError
        ? error.message
        : error instanceof Error
          ? error.message
          : "ดำเนินการไม่สำเร็จ";
    console.error(message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
