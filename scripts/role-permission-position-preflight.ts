import path from "node:path";

import { Pool } from "pg";

import {
  buildDatabasePoolConfig,
  buildTrustedPgSsl,
  loadSupabaseDbCaCertificate,
} from "../src/lib/db/ca-certificate";
import { requireSafeEnvironment } from "../src/lib/env/guard";
import { loadProjectEnv } from "./load-project-env";

loadProjectEnv(process.cwd());

type QueryResult = { rows: Array<Record<string, unknown>> };

async function main() {
  const projectRoot = path.resolve(process.cwd());
  requireSafeEnvironment({ projectRoot });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH,
    projectRoot,
  );
  const pool = new Pool(
    buildDatabasePoolConfig(databaseUrl, buildTrustedPgSsl(content), { max: 1 }),
  );
  const client = await pool.connect();
  const evidence: Record<string, unknown> = {};
  const query = async (sql: string): Promise<QueryResult> => client.query(sql);
  const count = async (sql: string) => Number((await query(sql)).rows[0]?.count ?? 0);

  try {
    await client.query("BEGIN READ ONLY");
    evidence.identity = (await query(`
      SELECT current_database() AS database, current_user AS database_user,
             current_setting('transaction_read_only') AS transaction_read_only,
             version() AS version
    `)).rows[0];

    evidence.gateC = {
      platformRoleOwnershipShape: await count(`SELECT count(*) FROM platform.organization_roles WHERE (is_system AND organization_id IS NOT NULL) OR (NOT is_system AND organization_id IS NULL)`),
      platformDuplicateSystemRoleCode: await count(`SELECT count(*) FROM (SELECT lower(btrim(code)) FROM platform.organization_roles WHERE is_system AND organization_id IS NULL GROUP BY lower(btrim(code)) HAVING count(*) > 1) q`),
      platformDuplicateOrganizationRoleCode: await count(`SELECT count(*) FROM (SELECT organization_id, lower(btrim(code)) FROM platform.organization_roles WHERE NOT is_system GROUP BY organization_id, lower(btrim(code)) HAVING count(*) > 1) q`),
      platformDuplicateOrganizationRoleName: await count(`SELECT count(*) FROM (SELECT organization_id, lower(btrim(name_th)) FROM platform.organization_roles WHERE NOT is_system GROUP BY organization_id, lower(btrim(name_th)) HAVING count(*) > 1) q`),
      hrLegacyPositionWithoutOrganization: await count(`SELECT count(*) FROM hr.positions WHERE organization_id IS NULL AND NOT is_system_standard`),
      hrDuplicatePositionNameScope: await count(`SELECT count(*) FROM (SELECT organization_id, branch_id, lower(btrim(name_th)) FROM hr.positions WHERE NOT is_system_standard GROUP BY organization_id, branch_id, lower(btrim(name_th)) HAVING count(*) > 1) q`),
      hrPositionTenantOrBranchMismatch: await count(`SELECT count(*) FROM hr.positions p LEFT JOIN platform.organizations o ON o.id=p.organization_id WHERE (NOT p.is_system_standard AND o.id IS NULL) OR (p.is_system_standard AND (p.organization_id IS NOT NULL OR p.branch_id IS NOT NULL))`),
      hrEmployeePositionMismatch: await count(`SELECT count(*) FROM hr.employees e JOIN hr.positions p ON p.id=e.position_id WHERE e.position_id IS NOT NULL AND p.organization_id<>e.organization_id`),
    };

    evidence.permissionActionInventory = (await query(`SELECT action, count(*)::int AS count FROM platform.permissions GROUP BY action ORDER BY action`)).rows;
    evidence.gateCDetails = {
      hrDuplicatePositionNames: (await query(`SELECT organization_id::text, branch_id::text, lower(btrim(name_th)) AS normalized_name, count(*)::int AS count, array_agg(id::text ORDER BY id) AS position_ids FROM hr.positions WHERE NOT is_system_standard GROUP BY organization_id, branch_id, lower(btrim(name_th)) HAVING count(*) > 1`)).rows,
      hrMissingOrganizations: (await query(`SELECT p.organization_id::text, count(*)::int AS position_count, array_agg(p.id::text ORDER BY p.id) AS position_ids FROM hr.positions p LEFT JOIN platform.organizations o ON o.id=p.organization_id WHERE NOT p.is_system_standard AND o.id IS NULL GROUP BY p.organization_id ORDER BY p.organization_id`)).rows,
      standardPositionCodeCollisions: (await query(`SELECT upper(btrim(code)) AS code, count(*)::int AS existing_custom_rows FROM hr.positions WHERE NOT is_system_standard AND upper(btrim(code)) IN ('OWNER','ADMIN','ACCOUNTANT','HR_OFFICER','EMPLOYEE','HOUSEKEEPER','COOK','DRIVER') GROUP BY upper(btrim(code)) ORDER BY code`)).rows,
      affectedPositionEvidence: (await query(`
        WITH affected AS (
          SELECT p.* FROM hr.positions p
          LEFT JOIN platform.organizations o ON o.id=p.organization_id
          WHERE NOT p.is_system_standard AND o.id IS NULL
             OR (p.organization_id,lower(btrim(p.name_th))) IN (
               SELECT organization_id,lower(btrim(name_th)) FROM hr.positions
               GROUP BY organization_id,lower(btrim(name_th)) HAVING count(*)>1
             )
        )
        SELECT a.id::text, a.organization_id::text, a.code, a.name_th, a.name_en,
               a.description, a.is_active, a.created_at, a.updated_at,
               count(e.id)::int AS employee_refs,
               array_remove(array_agg(DISTINCT e.organization_id::text),NULL) AS employee_organizations,
               array_remove(array_agg(DISTINCT e.branch_id::text),NULL) AS employee_branches,
               array_remove(array_agg(DISTINCT b.organization_id::text),NULL) AS branch_organizations
        FROM affected a
        LEFT JOIN hr.employees e ON e.position_id=a.id
        LEFT JOIN platform.branches b ON b.id=e.branch_id
        GROUP BY a.id,a.organization_id,a.code,a.name_th,a.name_en,a.description,a.is_active,a.created_at,a.updated_at
        ORDER BY a.organization_id,a.name_th,a.created_at,a.id
      `)).rows,
    };

    evidence.gateD = (await query(`
      SELECT current_user AS role,
             r.rolsuper, r.rolcreatedb, r.rolcreaterole,
             has_schema_privilege(current_user,'platform','USAGE') AS platform_usage,
             has_schema_privilege(current_user,'platform','CREATE') AS platform_create,
             has_schema_privilege(current_user,'hr','USAGE') AS hr_usage,
             has_schema_privilege(current_user,'hr','CREATE') AS hr_create,
             pg_has_role(current_user, c1.relowner, 'MEMBER') AS owns_platform_roles,
             pg_has_role(current_user, c2.relowner, 'MEMBER') AS owns_platform_permissions,
             pg_has_role(current_user, c3.relowner, 'MEMBER') AS owns_hr_positions,
             has_table_privilege(current_user,'platform.organization_roles','SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER') AS platform_roles_dml,
             has_table_privilege(current_user,'platform.permissions','SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER') AS platform_permissions_dml,
             has_table_privilege(current_user,'hr.positions','SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER') AS hr_positions_dml
      FROM pg_roles r
      JOIN pg_class c1 ON c1.oid='platform.organization_roles'::regclass
      JOIN pg_class c2 ON c2.oid='platform.permissions'::regclass
      JOIN pg_class c3 ON c3.oid='hr.positions'::regclass
      WHERE r.rolname=current_user
    `)).rows[0];

    evidence.gateE = {
      relations: (await query(`
        SELECT n.nspname AS schema, c.relname AS relation,
               pg_total_relation_size(c.oid)::bigint AS total_bytes,
               coalesce(s.n_live_tup,0)::bigint AS live_rows,
               coalesce(s.n_dead_tup,0)::bigint AS dead_rows
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid
        WHERE (n.nspname,c.relname) IN (('platform','organization_roles'),('platform','permissions'),('platform','platform_roles'),('hr','positions'))
        ORDER BY n.nspname,c.relname
      `)).rows,
      blockingLocks: await count(`SELECT count(*) FROM pg_locks blocked JOIN pg_stat_activity a ON a.pid=blocked.pid WHERE NOT blocked.granted AND a.datname=current_database()`),
      activeOtherSessions: await count(`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state<>'idle'`),
      transactionsOverFiveMinutes: await count(`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND xact_start IS NOT NULL AND now()-xact_start>interval '5 minutes'`),
    };

    evidence.gateH = {
      platformRolesToBackfill: await count(`SELECT count(*) FROM platform.platform_roles`),
      organizationRolesToBackfill: await count(`SELECT count(*) FROM platform.organization_roles`),
      permissionsToMap: await count(`SELECT count(*) FROM platform.permissions`),
      hrPositionsToClassify: await count(`SELECT count(*) FROM hr.positions`),
      hrEmployeesWithPosition: await count(`SELECT count(*) FROM hr.employees WHERE position_id IS NOT NULL`),
      hrDistinctPositionsInUse: await count(`SELECT count(DISTINCT position_id) FROM hr.employees WHERE position_id IS NOT NULL`),
      hrEmployeesWithoutPosition: await count(`SELECT count(*) FROM hr.employees WHERE position_id IS NULL`),
    };
    await client.query("ROLLBACK");
    console.log(JSON.stringify(evidence, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Preflight failed");
  process.exit(1);
});
