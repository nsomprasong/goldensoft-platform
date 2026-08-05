import fs from "node:fs";
import path from "node:path";

import { Pool, type PoolClient } from "pg";

import {
  buildDatabasePoolConfig,
  buildTrustedPgSsl,
  loadSupabaseDbCaCertificate,
} from "../src/lib/db/ca-certificate";
import { requireSafeEnvironment } from "../src/lib/env/guard";
import { loadProjectEnv } from "./load-project-env";

const BATCH_ID = "HR-REMEDIATE-20260805-391cafbf-257b-4f05-bd04-31a1e88996bb";
const DUPLICATE_ORG_ID = "54acc3c9-c043-428c-857a-465095658d72";
const DUPLICATE_NAME = "ตำแหน่งทดสอบ";

loadProjectEnv(process.cwd());

async function rows(client: PoolClient, sql: string, values: unknown[] = []) {
  return (await client.query(sql, values)).rows;
}

async function count(client: PoolClient, sql: string) {
  return Number((await client.query(sql)).rows[0]?.count ?? 0);
}

async function insertAudit(
  client: PoolClient,
  input: {
    organizationId: string | null;
    branchId?: string | null;
    actionCode: "position.update" | "employee.update";
    entityType: string;
    entityId: string;
    before: unknown;
    after: unknown;
  },
) {
  await client.query(
    `INSERT INTO hr.audit_logs
       (id,organization_id,branch_id,actor_auth_user_id,action_type_id,entity_type,entity_id,before_json,after_json,ip,user_agent,created_at)
     SELECT gen_random_uuid(),$1::uuid,$2::uuid,NULL,a.id,$3,$4,$5::jsonb,$6::jsonb,NULL,$7,now()
     FROM hr.audit_action_types a WHERE a.code=$8`,
    [
      input.organizationId,
      input.branchId ?? null,
      input.entityType,
      input.entityId,
      JSON.stringify(input.before),
      JSON.stringify(input.after),
      `codex-remediation/${BATCH_ID}`,
      input.actionCode,
    ],
  );
}

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
  const startedAt = new Date().toISOString();

  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

    const duplicatePositions = await rows(
      client,
      `SELECT * FROM hr.positions
       WHERE organization_id=$1::uuid AND lower(btrim(name_th))=lower(btrim($2))
       ORDER BY created_at,id FOR UPDATE`,
      [DUPLICATE_ORG_ID, DUPLICATE_NAME],
    );
    if (duplicatePositions.length !== 10) {
      throw new Error(`Expected 10 duplicate positions, found ${duplicatePositions.length}`);
    }
    const canonical = duplicatePositions[0];
    const duplicates = duplicatePositions.slice(1);

    const missingOrganizationPositions = await rows(
      client,
      `SELECT p.* FROM hr.positions p
       LEFT JOIN platform.organizations o ON o.id=p.organization_id
       WHERE o.id IS NULL ORDER BY p.organization_id,p.created_at,p.id FOR UPDATE OF p`,
    );
    if (missingOrganizationPositions.length !== 13) {
      throw new Error(`Expected 13 missing-organization positions, found ${missingOrganizationPositions.length}`);
    }

    const affectedIds = [...new Set(missingOrganizationPositions.map((row) => String(row.id)))];
    const affectedEmployees = await rows(
      client,
      `SELECT * FROM hr.employees WHERE position_id=ANY($1::uuid[]) ORDER BY organization_id,employee_code,id FOR UPDATE`,
      [affectedIds],
    );
    const orphanBranchEmployees = await rows(
      client,
      `SELECT e.*,o.id IS NOT NULL AS organization_exists
       FROM hr.employees e
       LEFT JOIN platform.branches b ON b.id=e.branch_id
       LEFT JOIN platform.organizations o ON o.id=e.organization_id
       WHERE b.id IS NULL OR b.organization_id<>e.organization_id
       ORDER BY e.organization_id,e.branch_id,e.employee_code,e.id FOR UPDATE OF e`,
    );
    const evidence = await rows(
      client,
      `SELECT p.id::text AS position_id,p.organization_id::text,
              count(e.id)::int AS employee_refs,
              array_remove(array_agg(DISTINCT e.organization_id::text),NULL) AS employee_organizations,
              array_remove(array_agg(DISTINCT e.branch_id::text),NULL) AS employee_branches
       FROM hr.positions p LEFT JOIN hr.employees e ON e.position_id=p.id
       WHERE p.id=ANY($1::uuid[]) GROUP BY p.id,p.organization_id ORDER BY p.id`,
      [affectedIds],
    );
    const ambiguous = evidence.filter(
      (item) =>
        item.employee_refs === 0 ||
        item.employee_organizations.length !== 1 ||
        item.employee_organizations[0] !== item.organization_id ||
        item.employee_branches.length !== 1,
    );
    if (ambiguous.length > 0) {
      throw new Error(`Ambiguous evidence for ${ambiguous.length} position(s); no writes performed`);
    }

    const snapshot = {
      batchId: BATCH_ID,
      capturedAt: startedAt,
      database: "postgres",
      backupRequirement: "WAIVED_TEST_DATABASE_BY_USER_2026-08-05",
      mappingRule: {
        duplicate: "oldest referenced row is canonical; repoint employees; rename and deactivate other rows; no deletes",
        missingOrganization: "recreate test organization and branch using the exact IDs proven by employee organization/branch evidence",
      },
      canonicalPositionId: canonical.id,
      categoryEntryCount: duplicatePositions.length + missingOrganizationPositions.length,
      uniqueAffectedPositionCount: affectedIds.length,
      duplicatePositions,
      missingOrganizationPositions,
      affectedEmployees,
      discoveredOrphanBranchEmployees: orphanBranchEmployees,
      evidence,
    };
    const snapshotDir = path.resolve(projectRoot, "../docs/remediation-evidence");
    fs.mkdirSync(snapshotDir, { recursive: true });
    const primarySnapshotPath = path.join(snapshotDir, `${BATCH_ID}-before.json`);
    let snapshotPath = primarySnapshotPath;
    let retryNumber = 0;
    while (fs.existsSync(snapshotPath)) {
      retryNumber += 1;
      snapshotPath = path.join(snapshotDir, `${BATCH_ID}-retry${retryNumber}-before.json`);
    }
    fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });

    console.log(JSON.stringify({
      batchId: BATCH_ID,
      snapshotPath,
      mapping: snapshot.mappingRule,
      canonicalPositionId: canonical.id,
      duplicateEntries: duplicatePositions.length,
      missingOrganizationEntries: missingOrganizationPositions.length,
      uniquePositions: affectedIds.length,
      employeeRowsCaptured: affectedEmployees.length,
      discoveredOrphanBranchEmployeeRows: orphanBranchEmployees.length,
    }, null, 2));

    const organizationIds = [
      ...new Set([
        ...missingOrganizationPositions.map((row) => String(row.organization_id)),
        ...orphanBranchEmployees
          .filter((employee) => !employee.organization_exists)
          .map((employee) => String(employee.organization_id)),
      ]),
    ];
    const activeOrgStatus = (await rows(client, `SELECT id FROM platform.organization_statuses WHERE code='ACTIVE' LIMIT 1`))[0];
    const activeBranchStatus = (await rows(client, `SELECT id FROM platform.branch_statuses WHERE code='ACTIVE' LIMIT 1`))[0];
    if (!activeOrgStatus || !activeBranchStatus) throw new Error("ACTIVE organization/branch status missing");

    for (const [index, organizationId] of organizationIds.entries()) {
      const short = organizationId.slice(0, 8);
      await client.query(
        `INSERT INTO platform.organizations
           (id,customer_code,slug,entity_type,legal_name,display_name,status_id,timezone,currency,created_at,updated_at)
         VALUES ($1::uuid,$2,$3,'LEGAL_ENTITY',$4,$4,$5::uuid,'Asia/Bangkok','THB',now(),now())`,
        [organizationId, `TEST-RESTORED-${short.toUpperCase()}`, `test-restored-${short}`, `Restored Test Organization ${index + 1}`, activeOrgStatus.id],
      );
    }

    const branchEvidence = new Map<string, string>();
    for (const employee of orphanBranchEmployees) {
      const branchId = String(employee.branch_id);
      const organizationId = String(employee.organization_id);
      const prior = branchEvidence.get(branchId);
      if (prior && prior !== organizationId) throw new Error(`Branch ${branchId} maps to multiple organizations`);
      branchEvidence.set(branchId, organizationId);
    }
    for (const [index, [branchId, organizationId]] of [...branchEvidence.entries()].entries()) {
      await client.query(
        `INSERT INTO platform.branches
           (id,organization_id,code,name,status_id,timezone,is_primary,created_at,updated_at)
         VALUES ($1::uuid,$2::uuid,$3,$4,$5::uuid,'Asia/Bangkok',false,now(),now())`,
        [branchId, organizationId, `RESTORED-${branchId.slice(0, 8).toUpperCase()}`, `Restored Test Branch ${index + 1}`, activeBranchStatus.id],
      );
    }
    for (const employee of orphanBranchEmployees) {
      await insertAudit(client, {
        organizationId: employee.organization_id,
        branchId: employee.branch_id,
        actionCode: "employee.update",
        entityType: "employee",
        entityId: employee.id,
        before: { batchId: BATCH_ID, branchReferenceExists: false, branchId: employee.branch_id },
        after: { batchId: BATCH_ID, branchReferenceExists: true, branchId: employee.branch_id, remediation: "restored-test-tenant-reference" },
      });
    }

    for (const duplicate of duplicates) {
      const employees = affectedEmployees.filter((employee) => employee.position_id === duplicate.id);
      for (const employee of employees) {
        await client.query(`UPDATE hr.employees SET position_id=$1::uuid,updated_at=now() WHERE id=$2::uuid`, [canonical.id, employee.id]);
        await insertAudit(client, {
          organizationId: employee.organization_id,
          branchId: employee.branch_id,
          actionCode: "employee.update",
          entityType: "employee",
          entityId: employee.id,
          before: { batchId: BATCH_ID, positionId: duplicate.id },
          after: { batchId: BATCH_ID, positionId: canonical.id, remediation: "duplicate-position-merge" },
        });
      }
      const suffix = String(duplicate.id).slice(0, 8);
      const renamedTh = `${duplicate.name_th} [รวมแล้ว ${suffix}]`;
      const renamedEn = `${duplicate.name_en} [merged ${suffix}]`;
      await client.query(
        `UPDATE hr.positions SET name_th=$1,name_en=$2,is_active=false,updated_at=now() WHERE id=$3::uuid`,
        [renamedTh, renamedEn, duplicate.id],
      );
      await insertAudit(client, {
        organizationId: duplicate.organization_id,
        actionCode: "position.update",
        entityType: "position",
        entityId: duplicate.id,
        before: { batchId: BATCH_ID, ...duplicate },
        after: { batchId: BATCH_ID, nameTh: renamedTh, nameEn: renamedEn, isActive: false, canonicalPositionId: canonical.id },
      });
    }

    await insertAudit(client, {
      organizationId: canonical.organization_id,
      actionCode: "position.update",
      entityType: "position",
      entityId: canonical.id,
      before: { batchId: BATCH_ID, canonical: false },
      after: { batchId: BATCH_ID, canonical: true, mergedPositionIds: duplicates.map((row) => row.id) },
    });

    for (const position of missingOrganizationPositions) {
      await insertAudit(client, {
        organizationId: position.organization_id,
        actionCode: "position.update",
        entityType: "position",
        entityId: position.id,
        before: { batchId: BATCH_ID, organizationReferenceExists: false, organizationId: position.organization_id },
        after: { batchId: BATCH_ID, organizationReferenceExists: true, organizationId: position.organization_id, remediation: "restored-test-tenant-reference" },
      });
    }

    const gateC = {
      roleOwnershipShape: await count(client, `SELECT count(*) FROM platform.organization_roles WHERE (is_system AND organization_id IS NOT NULL) OR (NOT is_system AND organization_id IS NULL)`),
      duplicateSystemRoleCode: await count(client, `SELECT count(*) FROM (SELECT lower(btrim(code)) FROM platform.organization_roles WHERE is_system AND organization_id IS NULL GROUP BY lower(btrim(code)) HAVING count(*)>1) q`),
      duplicateOrganizationRoleCode: await count(client, `SELECT count(*) FROM (SELECT organization_id,lower(btrim(code)) FROM platform.organization_roles WHERE NOT is_system GROUP BY organization_id,lower(btrim(code)) HAVING count(*)>1) q`),
      duplicateOrganizationRoleName: await count(client, `SELECT count(*) FROM (SELECT organization_id,lower(btrim(name_th)) FROM platform.organization_roles WHERE NOT is_system GROUP BY organization_id,lower(btrim(name_th)) HAVING count(*)>1) q`),
      positionWithoutOrganizationId: await count(client, `SELECT count(*) FROM hr.positions WHERE organization_id IS NULL`),
      duplicatePositionNameScope: await count(client, `SELECT count(*) FROM (SELECT organization_id,lower(btrim(name_th)) FROM hr.positions GROUP BY organization_id,lower(btrim(name_th)) HAVING count(*)>1) q`),
      missingPositionOrganization: await count(client, `SELECT count(*) FROM hr.positions p LEFT JOIN platform.organizations o ON o.id=p.organization_id WHERE o.id IS NULL`),
      positionEmployeeOrganizationMismatch: await count(client, `SELECT count(*) FROM hr.employees e JOIN hr.positions p ON p.id=e.position_id WHERE p.organization_id<>e.organization_id`),
      employeeBranchOrganizationMismatch: await count(client, `SELECT count(*) FROM hr.employees e LEFT JOIN platform.branches b ON b.id=e.branch_id WHERE b.id IS NULL OR b.organization_id<>e.organization_id`),
    };
    if (Object.values(gateC).some((value) => value !== 0)) {
      throw new Error(`Gate C failed after remediation: ${JSON.stringify(gateC)}`);
    }

    await client.query("COMMIT");
    console.log(JSON.stringify({
      committed: true,
      batchId: BATCH_ID,
      createdOrganizations: organizationIds.length,
      createdBranches: branchEvidence.size,
      employeeReferencesMoved: duplicates.reduce((total, row) => total + affectedEmployees.filter((employee) => employee.position_id === row.id).length, 0),
      duplicatePositionsRenamedAndDeactivated: duplicates.length,
      deletedRows: 0,
      gateC,
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Remediation failed");
  process.exit(1);
});
