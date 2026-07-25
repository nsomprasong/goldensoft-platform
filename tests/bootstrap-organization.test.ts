import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { assertSafeEnvironment } from "../src/lib/env/guard";
import {
  bootstrapGoldensoftOrganization,
  GOLDENSOFT_BRANCH,
  GOLDENSOFT_ORG,
  ORG_BOOTSTRAP_AUDIT_ACTION,
  ORG_BOOTSTRAP_SOURCE,
  OrgBootstrapError,
  verifyGoldensoftOrganization,
} from "../src/lib/platform/bootstrap-organization";
import { MASTER } from "../src/lib/platform/master-codes";

const NEW_REF = "horyhrnqbeaivdztekfv";
const LEGACY_REF = "invnwpyshxdadhocueeh";
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CA_REL = "certs/prod-ca-2021.crt";

const goodApi = `https://${NEW_REF}.supabase.co`;
const goodDb = `postgresql://postgres.${NEW_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;

type MasterRow = { id: string; code: string; isActive: boolean };

function master(code: string, isActive = true): MasterRow {
  return { id: randomUUID(), code, isActive };
}

type OrgRow = {
  id: string;
  customerCode: string;
  slug: string;
  legalName: string;
  displayName: string;
  statusId: string;
  deletedAt: Date | null;
};

type BranchRow = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  statusId: string;
  deletedAt: Date | null;
};

function createFakeDb(options?: {
  orgActiveInactive?: boolean;
  presetOrg?: { displayName: string; legalName: string; statusCode: string };
  presetBranch?: {
    organizationId?: string;
    name: string;
    statusCode: string;
  };
}) {
  const orgActive = master(
    MASTER.organizationStatus.ACTIVE,
    !options?.orgActiveInactive,
  );
  const orgSuspended = master(MASTER.organizationStatus.SUSPENDED);
  const branchActive = master(MASTER.branchStatus.ACTIVE);
  const branchInactive = master(MASTER.branchStatus.INACTIVE);

  const orgStatuses = [orgActive, orgSuspended];
  const branchStatuses = [branchActive, branchInactive];

  const state = {
    writes: 0,
    committed: true,
    organizations: [] as OrgRow[],
    branches: [] as BranchRow[],
    auditActions: [] as MasterRow[],
    audits: [] as Array<Record<string, unknown>>,
  };

  if (options?.presetOrg) {
    const statusId =
      orgStatuses.find((s) => s.code === options.presetOrg!.statusCode)?.id ??
      orgActive.id;
    state.organizations.push({
      id: randomUUID(),
      customerCode: GOLDENSOFT_ORG.customerCode,
      slug: GOLDENSOFT_ORG.slug,
      legalName: options.presetOrg.legalName,
      displayName: options.presetOrg.displayName,
      statusId,
      deletedAt: null,
    });
  }

  if (options?.presetBranch) {
    const statusId =
      branchStatuses.find((s) => s.code === options.presetBranch!.statusCode)
        ?.id ?? branchActive.id;
    state.branches.push({
      id: randomUUID(),
      organizationId:
        options.presetBranch.organizationId ??
        state.organizations[0]?.id ??
        randomUUID(),
      code: GOLDENSOFT_BRANCH.code,
      name: options.presetBranch.name,
      statusId,
      deletedAt: null,
    });
  }

  const orgStatusOf = (id: string) =>
    orgStatuses.find((s) => s.id === id) ?? orgActive;
  const branchStatusOf = (id: string) =>
    branchStatuses.find((s) => s.id === id) ?? branchActive;

  const bump = () => {
    state.writes += 1;
  };

  const db = {
    state,
    organizationStatus: {
      findUnique: async ({ where }: { where: { code: string } }) =>
        orgStatuses.find((s) => s.code === where.code) ?? null,
    },
    branchStatus: {
      findUnique: async ({ where }: { where: { code: string } }) =>
        branchStatuses.find((s) => s.code === where.code) ?? null,
    },
    organization: {
      findFirst: async ({
        where,
      }: {
        where: { customerCode: string; deletedAt: null };
      }) => {
        const row = state.organizations.find(
          (o) => o.customerCode === where.customerCode && o.deletedAt === null,
        );
        return row ? { ...row, status: orgStatusOf(row.statusId) } : null;
      },
      findMany: async ({
        where,
      }: {
        where: { customerCode: string; deletedAt: null };
      }) =>
        state.organizations
          .filter(
            (o) => o.customerCode === where.customerCode && o.deletedAt === null,
          )
          .map((o) => ({ ...o, status: orgStatusOf(o.statusId) })),
      create: async ({
        data,
      }: {
        data: {
          customerCode: string;
          slug: string;
          legalName: string;
          displayName: string;
          statusId: string;
        };
      }) => {
        bump();
        const row: OrgRow = { id: randomUUID(), deletedAt: null, ...data };
        state.organizations.push(row);
        return row;
      },
    },
    branch: {
      findFirst: async ({
        where,
      }: {
        where: { code: string; deletedAt: null };
      }) => {
        const row = state.branches.find(
          (b) => b.code === where.code && b.deletedAt === null,
        );
        return row ? { ...row, status: branchStatusOf(row.statusId) } : null;
      },
      findMany: async ({
        where,
      }: {
        where: { code: string; deletedAt: null };
      }) =>
        state.branches
          .filter((b) => b.code === where.code && b.deletedAt === null)
          .map((b) => ({ ...b, status: branchStatusOf(b.statusId) })),
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          code: string;
          name: string;
          statusId: string;
        };
      }) => {
        bump();
        const row: BranchRow = { id: randomUUID(), deletedAt: null, ...data };
        state.branches.push(row);
        return row;
      },
    },
    auditActionType: {
      upsert: async ({
        where,
        create,
      }: {
        where: { code: string };
        create: { code: string };
      }) => {
        let row = state.auditActions.find((a) => a.code === where.code);
        if (!row) {
          bump();
          row = { id: randomUUID(), code: create.code, isActive: true };
          state.auditActions.push(row);
        }
        return row;
      },
      findUnique: async ({ where }: { where: { code: string } }) =>
        state.auditActions.find((a) => a.code === where.code) ?? null,
    },
    auditLog: {
      findFirst: async ({
        where,
      }: {
        where: {
          actionTypeId: string;
          entityType: string;
          entityId: string;
          organizationId: string;
        };
      }) =>
        state.audits.find(
          (a) =>
            a.actionTypeId === where.actionTypeId &&
            a.entityType === where.entityType &&
            a.entityId === where.entityId &&
            a.organizationId === where.organizationId,
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        bump();
        const row = { id: randomUUID(), ...data };
        state.audits.push(row);
        return row;
      },
      count: async ({
        where,
      }: {
        where: { actionTypeId: string; entityType: string; entityId: string };
      }) =>
        state.audits.filter(
          (a) =>
            a.actionTypeId === where.actionTypeId &&
            a.entityType === where.entityType &&
            a.entityId === where.entityId,
        ).length,
    },
    async $transaction<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
      const snapshot = {
        organizations: structuredClone(state.organizations),
        branches: structuredClone(state.branches),
        auditActions: structuredClone(state.auditActions),
        audits: structuredClone(state.audits),
        writes: state.writes,
      };
      try {
        const result = await fn(db);
        state.committed = true;
        return result;
      } catch (error) {
        state.organizations = snapshot.organizations;
        state.branches = snapshot.branches;
        state.auditActions = snapshot.auditActions;
        state.audits = snapshot.audits;
        state.writes = snapshot.writes;
        state.committed = false;
        throw error;
      }
    },
  };

  return db;
}

function matchingOrg() {
  return {
    displayName: GOLDENSOFT_ORG.nameTh,
    legalName: GOLDENSOFT_ORG.nameEn,
    statusCode: MASTER.organizationStatus.ACTIVE,
  };
}

describe("GoldenSoft organization bootstrap", () => {
  it("does not write without confirmation (dry run)", async () => {
    const db = createFakeDb();
    const result = await bootstrapGoldensoftOrganization({
      db: db as never,
      projectRef: NEW_REF,
      dryRun: true,
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.preview.writeOperations, "NONE");
    assert.equal(db.state.writes, 0);
    assert.equal(db.state.organizations.length, 0);
    assert.equal(db.state.branches.length, 0);
  });

  it("rejects mismatched project ref via guard", () => {
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: goodApi,
      databaseUrl: goodDb,
      directUrl: `postgresql://postgres.otherproject:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=../certs/prod-ca-2021.crt`,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(result.ok, false);
  });

  it("rejects Legacy project ref via guard", () => {
    const legacyDb = `postgresql://postgres.${LEGACY_REF}:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
    const result = assertSafeEnvironment({
      appCode: "PLATFORM",
      supabaseUrl: `https://${LEGACY_REF}.supabase.co`,
      databaseUrl: legacyDb,
      directUrl: `${legacyDb.replace(":6543", ":5432")}?sslmode=verify-full&sslrootcert=../certs/prod-ca-2021.crt`,
      caCertPath: CA_REL,
      projectRoot: PROJECT_ROOT,
      expectedProjectRef: NEW_REF,
      blockedLegacyProjectRef: LEGACY_REF,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "LEGACY_BLOCKED");
  });

  it("creates organization and branch successfully", async () => {
    const db = createFakeDb();
    const result = await bootstrapGoldensoftOrganization({
      db: db as never,
      projectRef: NEW_REF,
      dryRun: false,
    });

    assert.equal(result.ok, true);
    assert.equal(result.counts.organizationsCreated, 1);
    assert.equal(result.counts.branchesCreated, 1);
    assert.equal(result.counts.auditsCreated, 1);
    assert.equal(db.state.organizations.length, 1);
    assert.equal(db.state.branches.length, 1);
    assert.equal(db.state.organizations[0]?.displayName, GOLDENSOFT_ORG.nameTh);
    assert.equal(db.state.organizations[0]?.legalName, GOLDENSOFT_ORG.nameEn);
    assert.equal(db.state.branches[0]?.name, GOLDENSOFT_BRANCH.nameTh);
    assert.equal(
      db.state.branches[0]?.organizationId,
      db.state.organizations[0]?.id,
    );
  });

  it("reuses matching organization", async () => {
    const db = createFakeDb({ presetOrg: matchingOrg() });
    const result = await bootstrapGoldensoftOrganization({
      db: db as never,
      projectRef: NEW_REF,
      dryRun: false,
    });

    assert.equal(result.counts.organizationsCreated, 0);
    assert.equal(result.counts.branchesCreated, 1);
    assert.equal(db.state.organizations.length, 1);
  });

  it("reuses matching branch", async () => {
    const db = createFakeDb({
      presetOrg: matchingOrg(),
      presetBranch: {
        name: GOLDENSOFT_BRANCH.nameTh,
        statusCode: MASTER.branchStatus.ACTIVE,
      },
    });
    const result = await bootstrapGoldensoftOrganization({
      db: db as never,
      projectRef: NEW_REF,
      dryRun: false,
    });

    assert.equal(result.counts.organizationsCreated, 0);
    assert.equal(result.counts.branchesCreated, 0);
    assert.equal(db.state.branches.length, 1);
  });

  it("rolls back on organization conflict", async () => {
    const db = createFakeDb({
      presetOrg: {
        displayName: "ชื่ออื่น",
        legalName: "Other",
        statusCode: MASTER.organizationStatus.ACTIVE,
      },
    });

    await assert.rejects(
      () =>
        bootstrapGoldensoftOrganization({
          db: db as never,
          projectRef: NEW_REF,
          dryRun: false,
        }),
      (err: unknown) =>
        err instanceof OrgBootstrapError &&
        err.code === "ORGANIZATION_CONFLICT",
    );
    assert.equal(db.state.branches.length, 0);
    assert.equal(db.state.committed, false);
  });

  it("rolls back when branch belongs to another organization", async () => {
    const db = createFakeDb({
      presetOrg: matchingOrg(),
      presetBranch: {
        organizationId: randomUUID(),
        name: GOLDENSOFT_BRANCH.nameTh,
        statusCode: MASTER.branchStatus.ACTIVE,
      },
    });

    await assert.rejects(
      () =>
        bootstrapGoldensoftOrganization({
          db: db as never,
          projectRef: NEW_REF,
          dryRun: false,
        }),
      (err: unknown) =>
        err instanceof OrgBootstrapError &&
        err.code === "BRANCH_WRONG_ORGANIZATION",
    );
    assert.equal(db.state.committed, false);
  });

  it("rolls back when organization ACTIVE master is missing", async () => {
    const db = createFakeDb({ orgActiveInactive: true });
    await assert.rejects(
      () =>
        bootstrapGoldensoftOrganization({
          db: db as never,
          projectRef: NEW_REF,
          dryRun: false,
        }),
      (err: unknown) =>
        err instanceof OrgBootstrapError && err.code === "MASTER_MISSING",
    );
    assert.equal(db.state.organizations.length, 0);
    assert.equal(db.state.committed, false);
  });

  it("is idempotent on repeat run", async () => {
    const db = createFakeDb();
    await bootstrapGoldensoftOrganization({
      db: db as never,
      projectRef: NEW_REF,
      dryRun: false,
    });
    const second = await bootstrapGoldensoftOrganization({
      db: db as never,
      projectRef: NEW_REF,
      dryRun: false,
    });

    assert.equal(second.counts.organizationsCreated, 0);
    assert.equal(second.counts.branchesCreated, 0);
    assert.equal(second.counts.auditsCreated, 0);
    assert.equal(db.state.organizations.length, 1);
    assert.equal(db.state.branches.length, 1);
    assert.equal(db.state.audits.length, 1);
  });

  it("creates audit event", async () => {
    const db = createFakeDb();
    await bootstrapGoldensoftOrganization({
      db: db as never,
      projectRef: NEW_REF,
      dryRun: false,
    });
    assert.equal(db.state.auditActions[0]?.code, ORG_BOOTSTRAP_AUDIT_ACTION);
    assert.equal(db.state.audits.length, 1);
    const after = db.state.audits[0]?.afterJson as Record<string, unknown>;
    assert.equal(after.source, ORG_BOOTSTRAP_SOURCE);
    assert.equal(after.organizationCode, GOLDENSOFT_ORG.customerCode);
    assert.equal(after.branchCode, GOLDENSOFT_BRANCH.code);
    assert.ok(after.timestamp);
  });

  it("verify passes after bootstrap", async () => {
    const db = createFakeDb();
    await bootstrapGoldensoftOrganization({
      db: db as never,
      projectRef: NEW_REF,
      dryRun: false,
    });
    const verified = await verifyGoldensoftOrganization({ db: db as never });
    assert.equal(verified.ok, true);
    assert.ok(verified.checks.every((c) => c.ok));
  });

  it("verify script source is read-only", () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, "scripts/verify-goldensoft-organization.ts"),
      "utf8",
    );
    assert.match(src, /verifyGoldensoftOrganization/);
    assert.match(src, /Write operations: NONE/);
    assert.match(src, /loadProjectEnv/);
    assert.equal(/\$executeRawUnsafe|\$executeRaw\b/.test(src), false);
    assert.equal(
      /(?:organization|branch|auditLog)\.(create|update|upsert|delete)\(/.test(
        src,
      ),
      false,
    );
    assert.equal(/bootstrapGoldensoftOrganization\s*\(/.test(src), false);
  });

  it("bootstrap script loads env before guard and stays dry-run without confirmation", () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, "scripts/bootstrap-goldensoft-organization.ts"),
      "utf8",
    );
    const loadIndex = src.indexOf("loadProjectEnv");
    const guardIndex = src.indexOf("env/guard");
    assert.ok(loadIndex >= 0);
    assert.ok(guardIndex > loadIndex);
    assert.match(src, /dryRun:\s*!confirmed/);
    assert.match(src, /ORGANIZATION_BOOTSTRAP_CONFIRM/);
  });

  it("does not modify Resident Legacy", () => {
    const legacyRoot = path.resolve(__dirname, "../../resident-legacy-reference");
    const status = execSync("git status --porcelain", {
      cwd: legacyRoot,
      encoding: "utf8",
    }).trim();
    assert.equal(status, "");
  });
});
