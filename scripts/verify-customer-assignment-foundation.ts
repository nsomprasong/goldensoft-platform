export {};

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());
  process.env.APP_CODE = "PLATFORM";

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const { requireSafeEnvironment } = await import("../src/lib/env/guard");
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");

  requireSafeEnvironment({ projectRoot: process.cwd() });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const { content } = loadSupabaseDbCaCertificate(process.env.SUPABASE_DB_CA_CERT_PATH ?? "", process.cwd());
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, buildTrustedPgSsl(content), { max: 1 }));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const migrations = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
      SELECT migration_name, finished_at, rolled_back_at
      FROM public._prisma_migrations
      WHERE migration_name IN ('0016_permission_scope_metadata', '0017_customer_organization_access_foundation')
      ORDER BY migration_name
    `;
    if (migrations.length !== 2 || migrations.some((row) => !row.finished_at || row.rolled_back_at)) {
      throw new Error("Platform migration history is incomplete");
    }

    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname::text AS indexname FROM pg_indexes
      WHERE schemaname = 'platform'
        AND indexname IN (
          'staff_org_assignment_policy_idx',
          'staff_org_assignment_branches_branch_idx',
          'staff_org_assignment_one_active_staff_org_idx'
        )
    `;
    if (indexes.length !== 3) throw new Error("Customer assignment indexes are incomplete");

    const foreignKeys = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.table_constraints
      WHERE constraint_schema = 'platform'
        AND constraint_type = 'FOREIGN KEY'
        AND table_name IN ('staff_organization_assignments', 'staff_organization_assignment_branches')
    `;
    if (Number(foreignKeys[0]?.count ?? 0) < 6) throw new Error("Customer assignment foreign keys are incomplete");

    const [roles, statuses, scopes, permissions, duplicateAssignments, orphanBranches] = await Promise.all([
      prisma.customerAssignmentRole.count({ where: { code: { in: ["PRIMARY", "CO_OWNER", "SUPPORT"] } } }),
      prisma.customerAssignmentStatus.count({ where: { code: { in: ["ACTIVE", "INACTIVE", "REVOKED"] } } }),
      prisma.customerAssignmentScopeType.count({ where: { code: { in: ["ALL_CURRENT_AND_FUTURE", "SELECTED_BRANCHES"] } } }),
      prisma.permission.findMany({ where: { code: { in: ["customer_assignment.manage", "customer_assignment.transfer"] } }, select: { code: true, scopeCode: true, productCode: true } }),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT staff_user_profile_id, organization_id
          FROM platform.staff_organization_assignments
          WHERE revoked_at IS NULL AND ends_at IS NULL
          GROUP BY staff_user_profile_id, organization_id HAVING COUNT(*) > 1
        ) duplicate_rows
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM platform.staff_organization_assignment_branches scope
        LEFT JOIN platform.branches branch ON branch.id = scope.branch_id
        LEFT JOIN platform.staff_organization_assignments assignment ON assignment.id = scope.assignment_id
        WHERE branch.id IS NULL OR assignment.id IS NULL OR branch.organization_id <> assignment.organization_id
      `,
    ]);
    if (roles !== 3 || statuses !== 3 || scopes !== 2 || permissions.length !== 2) throw new Error("Master seed counts are incomplete");
    if (permissions.some((row) => row.scopeCode !== "PLATFORM" || row.productCode !== "PLATFORM")) throw new Error("Assignment permissions have invalid scope metadata");
    if (Number(duplicateAssignments[0]?.count ?? 0) !== 0 || Number(orphanBranches[0]?.count ?? 0) !== 0) throw new Error("Assignment duplicate/orphan gate failed");

    const superAssignment = await prisma.platformRoleAssignment.findFirst({
      where: { revokedAt: null, role: { code: "SUPER_ADMIN", isActive: true }, userProfile: { deletedAt: null } },
      select: { userProfile: { select: { authUserId: true } } },
    });
    let effective = { platformCount: 0, organizationCount: 0, organizationPlatformOnlyLeak: 0 };
    if (superAssignment) {
      const organization = await prisma.organization.findFirst({ where: { deletedAt: null, status: { code: "ACTIVE" } }, select: { id: true } });
      const platformCodes = await prisma.permission.findMany({ where: { isActive: true, scopeCode: { in: ["PLATFORM", "BOTH"] } }, select: { code: true } });
      const entitledProducts = organization
        ? (await prisma.entitlement.findMany({ where: { organizationId: organization.id, status: { code: "ACTIVE" }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, select: { product: { select: { code: true } } } })).map((row) => row.product.code)
        : [];
      const organizationMetadata = organization
        ? await prisma.permission.findMany({ where: { isActive: true, scopeCode: { in: ["ORGANIZATION", "BOTH"] }, productCode: { in: ["PLATFORM", ...entitledProducts] } }, select: { scopeCode: true } })
        : [];
      effective = {
        platformCount: platformCodes.length,
        organizationCount: organizationMetadata.length,
        organizationPlatformOnlyLeak: organizationMetadata.filter((row) => row.scopeCode === "PLATFORM").length,
      };
      if (effective.organizationPlatformOnlyLeak !== 0) throw new Error("Platform-only permission leaked into organization context");
    }

    console.log(JSON.stringify({
      migrations: migrations.map((row) => row.migration_name),
      indexes: indexes.map((row) => row.indexname).sort(),
      foreignKeys: Number(foreignKeys[0]?.count ?? 0),
      masters: { roles, statuses, scopes, permissions: permissions.length },
      gates: { duplicateAssignments: 0, orphanBranches: 0 },
      effective,
    }));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
