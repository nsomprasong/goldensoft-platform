export {};

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());
  const adminEmail = process.env.GOLDENSOFT_INTERNAL_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) throw new Error("GOLDENSOFT_INTERNAL_ADMIN_EMAIL is required");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const { buildDatabasePoolConfig, buildTrustedPgSsl, loadSupabaseDbCaCertificate } = await import("../src/lib/db/ca-certificate");
  const { requireSafeEnvironment } = await import("../src/lib/env/guard");

  const projectRoot = process.cwd();
  requireSafeEnvironment({ projectRoot });
  const databaseUrl = process.env.DATABASE_URL;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!databaseUrl || !url || !secret || !publicKey) throw new Error("Verification configuration missing");

  const generateResponse = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: adminEmail }),
  });
  if (!generateResponse.ok) throw new Error(`Magic link generation failed: HTTP ${generateResponse.status}`);
  const generated = (await generateResponse.json()) as { id?: string; user?: { id?: string }; hashed_token?: string; properties?: { hashed_token?: string } };
  const tokenHash = generated.properties?.hashed_token ?? generated.hashed_token;
  if (!tokenHash) throw new Error(`Magic link token hash missing (response keys: ${Object.keys(generated).sort().join(",")})`);
  const verifyResponse = await fetch(`${url}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: publicKey, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  if (!verifyResponse.ok) throw new Error(`Session verification failed: HTTP ${verifyResponse.status}`);
  const session = (await verifyResponse.json()) as { user?: { id?: string; email?: string } };
  if (session.user?.email?.toLowerCase() !== adminEmail) throw new Error("Session identity mismatch");

  const { content } = loadSupabaseDbCaCertificate(process.env.SUPABASE_DB_CA_CERT_PATH, projectRoot);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, buildTrustedPgSsl(content), { max: 1 }));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const rows = await prisma.$queryRaw<Array<Record<string, number | string | boolean | null>>>`
      WITH target AS (
        SELECT o.id organization_id,b.id branch_id,up.id profile_id,up.auth_user_id
        FROM platform.organizations o
        JOIN platform.branches b ON b.organization_id=o.id AND b.code='HEADQUARTERS' AND b.deleted_at IS NULL
        JOIN platform.user_profiles up ON lower(up.email)=lower(${adminEmail}) AND up.deleted_at IS NULL
        WHERE o.customer_code='GOLDENSOFT' AND o.deleted_at IS NULL
      ), membership AS (
        SELECT m.id,m.organization_id,m.user_profile_id
        FROM platform.organization_memberships m JOIN target t ON t.organization_id=m.organization_id AND t.profile_id=m.user_profile_id
        JOIN platform.membership_statuses s ON s.id=m.status_id AND s.code='ACTIVE'
      )
      SELECT
        (SELECT count(*) FROM platform.organizations WHERE customer_code='GOLDENSOFT' AND deleted_at IS NULL)::int organization_count,
        (SELECT count(*) FROM platform.branches b JOIN target t ON t.organization_id=b.organization_id WHERE b.code='HEADQUARTERS' AND b.is_primary=true AND b.deleted_at IS NULL)::int branch_count,
        (SELECT count(*) FROM membership)::int membership_count,
        (SELECT count(*) FROM platform.organization_membership_roles mr JOIN membership m ON m.id=mr.membership_id JOIN platform.assignment_statuses s ON s.id=mr.status_id AND s.code='ACTIVE' JOIN platform.organization_roles r ON r.id=mr.role_id WHERE r.code IN ('OWNER','ADMIN') AND mr.revoked_at IS NULL)::int organization_role_count,
        (SELECT count(*) FROM platform.organization_membership_branch_scopes bs JOIN membership m ON m.id=bs.membership_id JOIN platform.branch_scope_types st ON st.id=bs.scope_type_id AND st.code='ALL_BRANCHES' JOIN platform.assignment_statuses s ON s.id=bs.status_id AND s.code='ACTIVE' WHERE bs.branch_id IS NULL)::int all_branch_scope_count,
        (SELECT count(*) FROM platform.platform_role_assignments pra JOIN target t ON t.profile_id=pra.user_profile_id JOIN platform.assignment_statuses s ON s.id=pra.status_id AND s.code='ACTIVE')::int platform_assignment_count,
        (SELECT count(*) FROM platform.entitlements e JOIN target t ON t.organization_id=e.organization_id JOIN platform.entitlement_statuses s ON s.id=e.status_id AND s.code='ACTIVE' WHERE e.code='hr.access' AND (e.ends_at IS NULL OR e.ends_at>now()))::int hr_access_count,
        (SELECT count(*) FROM hr.positions WHERE is_system_standard=true AND organization_id IS NULL AND branch_id IS NULL AND is_active=true)::int global_positions,
        (SELECT count(*) FROM hr.employees e JOIN target t ON t.organization_id=e.organization_id AND t.branch_id=e.branch_id AND t.profile_id=e.platform_user_id AND t.auth_user_id=e.auth_user_id WHERE e.is_active=true)::int linked_employee_count,
        (SELECT count(*) FROM platform.organization_roles WHERE is_active=true AND (organization_id IS NULL OR organization_id=(SELECT organization_id FROM target)))::int visible_roles,
        (SELECT count(*) FROM hr.positions p,target t WHERE p.is_active=true AND ((p.is_system_standard=true AND p.organization_id IS NULL AND p.branch_id IS NULL) OR (p.organization_id=t.organization_id AND (p.branch_id IS NULL OR p.branch_id=t.branch_id))))::int visible_positions,
        (SELECT count(*) FROM hr.employees e,target t WHERE e.organization_id=t.organization_id AND e.branch_id=t.branch_id AND e.is_active=true)::int visible_employees
    `;
    const result = rows[0];
    if (!result || Object.entries(result).some(([key, value]) => key !== "global_positions" && key !== "visible_roles" && key !== "visible_positions" && key !== "visible_employees" && Number(value) !== 1)) {
      throw new Error(`GoldenSoft verification failed: ${JSON.stringify(result)}`);
    }
    if (Number(result.global_positions) !== 8 || Number(result.visible_roles) < 1 || Number(result.visible_positions) < 8 || Number(result.visible_employees) < 1) {
      throw new Error(`GoldenSoft page data verification failed: ${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify({ login: "PASS_MAGIC_LINK_SESSION_NO_EMAIL_SENT", sessionIdentityMatched: session.user?.id === (generated.user?.id ?? generated.id), platformAdmin: Number(result.platform_assignment_count) === 1, organizationContextSelectable: true, headquartersContextSelectable: true, hrAccess: Number(result.hr_access_count) === 1, pageData: result, defaultContextPersistence: "COOKIE_SESSION_SCOPED_NOT_DATABASE_PERSISTED" }, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
