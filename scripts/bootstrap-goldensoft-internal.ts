export {};

const CONFIRM_VALUE = "ENSURE_GOLDENSOFT_INTERNAL";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function maskUuid(value: string): string {
  return `${value.slice(0, 8)}-****-****-****-${value.slice(-4)}`;
}

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());
  const adminEmail = requiredEnv("GOLDENSOFT_INTERNAL_ADMIN_EMAIL").toLowerCase();
  const employeeCode = requiredEnv("GOLDENSOFT_INTERNAL_EMPLOYEE_CODE");
  const firstNameTh = requiredEnv("GOLDENSOFT_INTERNAL_FIRST_NAME_TH");
  const lastNameTh = requiredEnv("GOLDENSOFT_INTERNAL_LAST_NAME_TH");
  const firstNameEn = process.env.GOLDENSOFT_INTERNAL_FIRST_NAME_EN?.trim() || null;
  const lastNameEn = process.env.GOLDENSOFT_INTERNAL_LAST_NAME_EN?.trim() || null;
  const displayName = requiredEnv("GOLDENSOFT_INTERNAL_DISPLAY_NAME");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const { buildDatabasePoolConfig, buildTrustedPgSsl, loadSupabaseDbCaCertificate } = await import("../src/lib/db/ca-certificate");
  const { assertSafeEnvironment, requireSafeEnvironment } = await import("../src/lib/env/guard");
  const { bootstrapGoldensoftOrganization, GOLDENSOFT_BRANCH, GOLDENSOFT_ORG } = await import("../src/lib/platform/bootstrap-organization");
  const { buildSubscriptionSnapshot } = await import("../src/lib/platform/snapshot");
  const { catalogFeaturesForProduct, generateEntitlementsForSubscription } = await import("../src/lib/platform/entitlements");

  const projectRoot = process.cwd();
  const guard = assertSafeEnvironment({ projectRoot });
  if (!guard.ok) throw new Error(`${guard.code}: ${guard.reason}`);
  requireSafeEnvironment({ projectRoot });
  if (process.env.GOLDENSOFT_INTERNAL_CONFIRM !== CONFIRM_VALUE) {
    throw new Error(`Set GOLDENSOFT_INTERNAL_CONFIRM=${CONFIRM_VALUE}`);
  }
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!databaseUrl || !supabaseUrl || !secretKey) throw new Error("Required database/Auth configuration missing");

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
  });
  if (!authResponse.ok) throw new Error(`Auth lookup failed: HTTP ${authResponse.status}`);
  const authUsers = ((await authResponse.json()) as { users?: Array<{ id: string; email?: string; email_confirmed_at?: string | null }> }).users ?? [];
  const authUser = authUsers.find((row) => row.email?.trim().toLowerCase() === adminEmail);
  if (!authUser || !authUser.email_confirmed_at) throw new Error("Confirmed Super Admin Auth user not found");

  const { content } = loadSupabaseDbCaCertificate(process.env.SUPABASE_DB_CA_CERT_PATH, projectRoot);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, buildTrustedPgSsl(content), { max: 1 }));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    await bootstrapGoldensoftOrganization({ db: prisma, projectRef: guard.projectRef ?? "unknown", dryRun: false });
    const result = await prisma.$transaction(async (tx) => {
      const [organization, branch, profile, membershipActive, assignmentActive, allBranches, ownerRole] = await Promise.all([
        tx.organization.findUniqueOrThrow({ where: { customerCode: GOLDENSOFT_ORG.customerCode } }),
        tx.branch.findFirstOrThrow({ where: { organization: { customerCode: GOLDENSOFT_ORG.customerCode }, code: GOLDENSOFT_BRANCH.code } }),
        tx.userProfile.findUniqueOrThrow({ where: { authUserId: authUser.id } }),
        tx.membershipStatus.findUniqueOrThrow({ where: { code: "ACTIVE" } }),
        tx.assignmentStatus.findUniqueOrThrow({ where: { code: "ACTIVE" } }),
        tx.branchScopeType.findUniqueOrThrow({ where: { code: "ALL_BRANCHES" } }),
        tx.organizationRole.findFirstOrThrow({ where: { organizationId: null, code: { in: ["OWNER", "ADMIN"] }, isActive: true }, orderBy: { code: "desc" } }),
      ]);
      const membership = await tx.organizationMembership.upsert({
        where: { organizationId_userProfileId: { organizationId: organization.id, userProfileId: profile.id } },
        create: { organizationId: organization.id, userProfileId: profile.id, statusId: membershipActive.id, joinedAt: new Date(), invitedByAuthUserId: authUser.id },
        update: { statusId: membershipActive.id, endedAt: null },
      });
      const roleAssignment = await tx.organizationMembershipRole.findFirst({ where: { membershipId: membership.id, roleId: ownerRole.id, revokedAt: null } });
      if (roleAssignment) {
        await tx.organizationMembershipRole.update({ where: { id: roleAssignment.id }, data: { statusId: assignmentActive.id } });
      } else {
        await tx.organizationMembershipRole.create({ data: { membershipId: membership.id, roleId: ownerRole.id, statusId: assignmentActive.id } });
      }
      const scope = await tx.organizationMembershipBranchScope.findFirst({ where: { membershipId: membership.id, scopeTypeId: allBranches.id, branchId: null } });
      if (!scope) {
        await tx.organizationMembershipBranchScope.create({ data: { membershipId: membership.id, scopeTypeId: allBranches.id, branchId: null, statusId: assignmentActive.id } });
      } else if (scope.statusId !== assignmentActive.id) {
        await tx.organizationMembershipBranchScope.update({ where: { id: scope.id }, data: { statusId: assignmentActive.id } });
      }

      const product = await tx.product.findFirstOrThrow({ where: { code: { in: ["GOLDENSOFT_HR", "HR"] }, status: { code: "ACTIVE" } }, include: { plans: { include: { versions: { include: { status: true, billingCycleDefault: true }, orderBy: { versionNumber: "desc" } } } } } });
      let subscription = await tx.subscription.findFirst({ where: { organizationId: organization.id, productId: product.id, status: { code: { in: ["ACTIVE", "TRIAL"] } } } });
      if (!subscription) {
        const plan = product.plans.find((item) => item.versions.some((version) => version.status.code === "PUBLISHED" || version.status.code === "ACTIVE")) ?? product.plans[0];
        const version = plan?.versions.find((item) => item.status.code === "PUBLISHED" || item.status.code === "ACTIVE") ?? plan?.versions[0];
        if (!plan || !version) throw new Error("Active HR plan/version missing");
        const subscriptionStatus = await tx.subscriptionStatus.findUniqueOrThrow({ where: { code: "ACTIVE" } });
        const features = catalogFeaturesForProduct(product.code);
        subscription = await tx.subscription.create({ data: {
          organizationId: organization.id, productId: product.id, planId: plan.id, planVersionId: version.id,
          statusId: subscriptionStatus.id, billingCycleId: version.billingCycleDefaultId, planCode: plan.code,
          planVersionNumber: version.versionNumber, priceAmount: version.priceAmount, currency: version.currency,
          snapshotJson: buildSubscriptionSnapshot({ product: { code: product.code }, plan: { code: plan.code, name: plan.name }, planVersion: { versionNumber: version.versionNumber, priceAmount: version.priceAmount, currency: version.currency }, billingCycleCode: version.billingCycleDefault.code, featureCodes: features.map((item) => item.code), limits: { internalProvider: true } }),
          startsAt: new Date(), externalRef: `internal:${GOLDENSOFT_ORG.customerCode}:${product.code}`,
        } });
      }
      await generateEntitlementsForSubscription(tx, subscription.id);

      const platformAssignments = await tx.platformRoleAssignment.count({ where: { userProfileId: profile.id, status: { code: "ACTIVE" } } });
      return { organization, branch, profile, membership, ownerRole, subscription, platformAssignments };
    });

    const hrRows = await prisma.$queryRaw<Array<{ employee_id: string; position_id: string }>>`
      WITH masters AS (
        SELECT
          (SELECT id FROM hr.employment_types WHERE code='MONTHLY') AS employment_type_id,
          (SELECT id FROM hr.employee_statuses WHERE code='ACTIVE') AS employee_status_id,
          (SELECT id FROM hr.employee_account_access_statuses WHERE code='ACTIVE') AS access_status_id,
          (SELECT id FROM hr.employee_onboarding_methods WHERE code='NO_NOTIFICATION') AS onboarding_method_id,
          (SELECT id FROM hr.positions WHERE is_system_standard=true AND immutable_code='OWNER') AS position_id
      ), inserted AS (
        INSERT INTO hr.employees (id,organization_id,employee_code,platform_user_id,auth_user_id,branch_id,position_id,employment_type_id,employee_status_id,account_access_status_id,onboarding_method_id,account_activated_at,first_name_th,last_name_th,first_name_en,last_name_en,display_name,phone,email,hire_date,is_active,created_at,updated_at,created_by,updated_by)
        SELECT gen_random_uuid(),${result.organization.id}::uuid,${employeeCode},${result.profile.id}::uuid,${authUser.id}::uuid,${result.branch.id}::uuid,m.position_id,m.employment_type_id,m.employee_status_id,m.access_status_id,m.onboarding_method_id,now(),${firstNameTh},${lastNameTh},${firstNameEn},${lastNameEn},${displayName},'-',${adminEmail},current_date,true,now(),now(),${authUser.id}::uuid,${authUser.id}::uuid FROM masters m
        ON CONFLICT (organization_id,employee_code) DO UPDATE SET platform_user_id=EXCLUDED.platform_user_id,auth_user_id=EXCLUDED.auth_user_id,branch_id=EXCLUDED.branch_id,position_id=EXCLUDED.position_id,employee_status_id=EXCLUDED.employee_status_id,account_access_status_id=EXCLUDED.account_access_status_id,is_active=true,updated_at=now(),updated_by=EXCLUDED.updated_by
        RETURNING id,position_id
      ) SELECT id::text AS employee_id,position_id::text FROM inserted
    `;
    if (!hrRows[0]) throw new Error("HR employee upsert failed");

    console.log(JSON.stringify({
      organizationId: maskUuid(result.organization.id), branchId: maskUuid(result.branch.id), membershipId: maskUuid(result.membership.id),
      organizationCode: result.organization.customerCode, branchCode: result.branch.code, branchPrimary: result.branch.isPrimary,
      organizationRole: result.ownerRole.code, branchScope: "ALL_BRANCHES", platformRoleAssignmentsPreserved: result.platformAssignments,
      hrSubscriptionId: maskUuid(result.subscription.id), hrEmployeeId: maskUuid(hrRows[0].employee_id), hrPositionId: maskUuid(hrRows[0].position_id),
      authUserId: maskUuid(authUser.id), idempotentKeys: ["customerCode", "organizationId+branchCode", "organizationId+userProfileId", "organizationId+employeeCode"],
    }, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
