import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";

import { assertResidentLegacyUntouched } from "./helpers/legacy-untouched";

import {
  AUTH_LOOKUP_MESSAGES,
  BOOTSTRAP_AUDIT_ACTION,
  BOOTSTRAP_CONFIRM_VALUE,
  BootstrapError,
  bootstrapFirstSuperAdmin,
  evaluateAuthAdminLookup,
  fetchAuthAdminUserById,
  formatAuthLookupDiagnostic,
  hasBootstrapConfirmation,
  isValidUuid,
  parseBootstrapEnv,
  resolveBootstrapAuthUser,
  verifyFirstSuperAdmin,
} from "../src/lib/auth/bootstrap-first-admin";
import { MASTER } from "../src/lib/platform/master-codes";

const AUTH_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_AUTH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EMAIL = "admin@example.com";

type MasterRow = {
  id: string;
  code: string;
  isActive: boolean;
  nameTh?: string;
  nameEn?: string;
};

function master(code: string, active = true): MasterRow {
  return { id: randomUUID(), code, isActive: active, nameTh: code, nameEn: code };
}

function createFakeDb(options?: {
  omitSuperAdmin?: boolean;
  omitOwner?: boolean;
  multiBranch?: boolean;
  orgCode?: string;
}) {
  const orgCode = options?.orgCode ?? "CUST-A";
  const userActive = master(MASTER.userProfileStatus.ACTIVE);
  const assignmentActive = master(MASTER.assignmentStatus.ACTIVE);
  const membershipActive = master(MASTER.membershipStatus.ACTIVE);
  const selected = master(MASTER.branchScopeType.SELECTED);
  const allBranches = master(MASTER.branchScopeType.ALL_BRANCHES);
  const branchActive = master(MASTER.branchStatus.ACTIVE);
  const superAdmin = master(MASTER.platformRole.SUPER_ADMIN);
  const owner = master(MASTER.organizationRole.OWNER);

  const platformRoles = options?.omitSuperAdmin ? [] : [superAdmin];
  const organizationRoles = options?.omitOwner ? [] : [owner];

  const orgId = randomUUID();
  const branch1 = {
    id: randomUUID(),
    organizationId: orgId,
    code: "HQ",
    name: "สำนักงานใหญ่",
    statusId: branchActive.id,
    deletedAt: null as Date | null,
    createdAt: new Date("2026-01-01"),
    status: branchActive,
  };
  const branch2 = {
    id: randomUUID(),
    organizationId: orgId,
    code: "B2",
    name: "สาขา 2",
    statusId: branchActive.id,
    deletedAt: null as Date | null,
    createdAt: new Date("2026-01-02"),
    status: branchActive,
  };

  const state = {
    writes: 0,
    profiles: [] as Array<{
      id: string;
      authUserId: string;
      email: string;
      displayName: string;
      statusId: string;
    }>,
    platformRoleAssignments: [] as Array<{
      id: string;
      userProfileId: string;
      roleId: string;
      statusId: string;
      revokedAt: Date | null;
      assignedByAuthUserId: string | null;
    }>,
    memberships: [] as Array<{
      id: string;
      organizationId: string;
      userProfileId: string;
      statusId: string;
    }>,
    membershipRoles: [] as Array<{
      id: string;
      membershipId: string;
      roleId: string;
      statusId: string;
      revokedAt: Date | null;
    }>,
    branchScopes: [] as Array<{
      id: string;
      membershipId: string;
      scopeTypeId: string;
      branchId: string | null;
      statusId: string;
    }>,
    auditActions: [] as MasterRow[],
    audits: [] as Array<Record<string, unknown>>,
    committed: true,
  };

  const branches = options?.multiBranch ? [branch1, branch2] : [branch1];

  const organization = {
    id: orgId,
    customerCode: orgCode,
    deletedAt: null as Date | null,
    status: master(MASTER.organizationStatus.ACTIVE),
    branches,
  };

  function bumpWrite() {
    state.writes += 1;
  }

  const db = {
    state,
    branch1,
    masters: {
      userProfileStatus: [userActive],
      platformRole: platformRoles,
      assignmentStatus: [assignmentActive],
      membershipStatus: [membershipActive],
      organizationRole: organizationRoles,
      branchScopeType: [selected, allBranches],
      branchStatus: [branchActive],
    },
    userProfile: {
      findUnique: async ({
        where,
      }: {
        where: { authUserId?: string; email?: string };
      }) => {
        if (where.authUserId) {
          return (
            state.profiles.find((p) => p.authUserId === where.authUserId) ?? null
          );
        }
        if (where.email) {
          return state.profiles.find((p) => p.email === where.email) ?? null;
        }
        return null;
      },
      create: async ({
        data,
      }: {
        data: {
          authUserId: string;
          email: string;
          displayName: string;
          statusId: string;
        };
      }) => {
        bumpWrite();
        const row = { id: randomUUID(), ...data };
        state.profiles.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { statusId: string };
      }) => {
        bumpWrite();
        const row = state.profiles.find((p) => p.id === where.id);
        if (!row) throw new Error("missing profile");
        row.statusId = data.statusId;
        return row;
      },
    },
    platformRoleAssignment: {
      findFirst: async ({
        where,
      }: {
        where: {
          userProfileId: string;
          roleId: string;
          revokedAt: null;
          statusId: string;
        };
      }) =>
        state.platformRoleAssignments.find(
          (r) =>
            r.userProfileId === where.userProfileId &&
            r.roleId === where.roleId &&
            r.revokedAt === null &&
            r.statusId === where.statusId,
        ) ?? null,
      findMany: async ({
        where,
      }: {
        where: {
          userProfileId: string;
          revokedAt: null;
          role: { code: string };
          status: { code: string };
        };
      }) => {
        const role = platformRoles.find((r) => r.code === where.role.code);
        if (!role) return [];
        return state.platformRoleAssignments.filter(
          (r) =>
            r.userProfileId === where.userProfileId &&
            r.roleId === role.id &&
            r.revokedAt === null &&
            r.statusId === assignmentActive.id,
        );
      },
      create: async ({
        data,
      }: {
        data: {
          userProfileId: string;
          roleId: string;
          statusId: string;
          assignedByAuthUserId: string;
        };
      }) => {
        bumpWrite();
        const row = { id: randomUUID(), revokedAt: null, ...data };
        state.platformRoleAssignments.push(row);
        return row;
      },
    },
    organization: {
      findFirst: async ({
        where,
      }: {
        where: { customerCode: string; deletedAt: null };
      }) => {
        if (organization.customerCode !== where.customerCode) return null;
        return {
          ...organization,
          branches: organization.branches.map((b) => ({
            ...b,
            status: branchActive,
          })),
        };
      },
    },
    organizationMembership: {
      findUnique: async ({
        where,
      }: {
        where: {
          organizationId_userProfileId: {
            organizationId: string;
            userProfileId: string;
          };
        };
      }) => {
        const m = state.memberships.find(
          (x) =>
            x.organizationId ===
              where.organizationId_userProfileId.organizationId &&
            x.userProfileId === where.organizationId_userProfileId.userProfileId,
        );
        if (!m) return null;
        return hydrateMembership(m);
      },
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          userProfileId: string;
          statusId: string;
          joinedAt: Date;
          invitedByAuthUserId: string;
        };
      }) => {
        bumpWrite();
        const row = {
          id: randomUUID(),
          organizationId: data.organizationId,
          userProfileId: data.userProfileId,
          statusId: data.statusId,
        };
        state.memberships.push(row);
        return hydrateMembership(row);
      },
    },
    organizationMembershipRole: {
      create: async ({
        data,
      }: {
        data: { membershipId: string; roleId: string; statusId: string };
      }) => {
        bumpWrite();
        const row = { id: randomUUID(), revokedAt: null, ...data };
        state.membershipRoles.push(row);
        return row;
      },
    },
    organizationMembershipBranchScope: {
      create: async ({
        data,
      }: {
        data: {
          membershipId: string;
          scopeTypeId: string;
          branchId: string;
          statusId: string;
        };
      }) => {
        bumpWrite();
        const row = { id: randomUUID(), ...data };
        state.branchScopes.push(row);
        return row;
      },
    },
    auditActionType: {
      upsert: async ({
        where,
        create,
      }: {
        where: { code: string };
        create: MasterRow & { sortOrder: number; isSystem: boolean };
      }) => {
        let row = state.auditActions.find((a) => a.code === where.code);
        if (!row) {
          bumpWrite();
          row = {
            id: randomUUID(),
            code: create.code,
            isActive: true,
            nameTh: create.nameTh,
            nameEn: create.nameEn,
          };
          state.auditActions.push(row);
        }
        return row;
      },
    },
    auditLog: {
      findFirst: async ({
        where,
      }: {
        where: {
          actionTypeId: string;
          actorAuthUserId: string;
          entityType: string;
          entityId: string;
          organizationId: string;
        };
      }) =>
        state.audits.find(
          (a) =>
            a.actionTypeId === where.actionTypeId &&
            a.actorAuthUserId === where.actorAuthUserId &&
            a.entityType === where.entityType &&
            a.entityId === where.entityId &&
            a.organizationId === where.organizationId,
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        bumpWrite();
        const row = { id: randomUUID(), ...data };
        state.audits.push(row);
        return row;
      },
    },
    userProfileStatus: {
      findUnique: async ({ where }: { where: { code: string } }) =>
        [userActive].find((m) => m.code === where.code) ?? null,
    },
    platformRole: {
      findUnique: async ({ where }: { where: { code: string } }) =>
        platformRoles.find((m) => m.code === where.code) ?? null,
    },
    assignmentStatus: {
      findUnique: async ({ where }: { where: { code: string } }) =>
        [assignmentActive].find((m) => m.code === where.code) ?? null,
    },
    membershipStatus: {
      findUnique: async ({ where }: { where: { code: string } }) =>
        [membershipActive].find((m) => m.code === where.code) ?? null,
    },
    organizationRole: {
      findUnique: async ({ where }: { where: { code: string } }) =>
        organizationRoles.find((m) => m.code === where.code) ?? null,
    },
    branchScopeType: {
      findUnique: async ({ where }: { where: { code: string } }) =>
        [selected, allBranches].find((m) => m.code === where.code) ?? null,
    },
    branchStatus: {
      findUnique: async ({ where }: { where: { code: string } }) =>
        [branchActive].find((m) => m.code === where.code) ?? null,
    },
    async $transaction<T>(fn: (tx: never) => Promise<T>): Promise<T> {
      const snapshot = {
        profiles: structuredClone(state.profiles),
        platformRoleAssignments: structuredClone(state.platformRoleAssignments),
        memberships: structuredClone(state.memberships),
        membershipRoles: structuredClone(state.membershipRoles),
        branchScopes: structuredClone(state.branchScopes),
        auditActions: structuredClone(state.auditActions),
        audits: structuredClone(state.audits),
        writes: state.writes,
      };
      try {
        const result = await fn(this as never);
        state.committed = true;
        return result;
      } catch (error) {
        state.profiles = snapshot.profiles;
        state.platformRoleAssignments = snapshot.platformRoleAssignments;
        state.memberships = snapshot.memberships;
        state.membershipRoles = snapshot.membershipRoles;
        state.branchScopes = snapshot.branchScopes;
        state.auditActions = snapshot.auditActions;
        state.audits = snapshot.audits;
        state.writes = snapshot.writes;
        state.committed = false;
        throw error;
      }
    },
  };

  function hydrateMembership(m: {
    id: string;
    organizationId: string;
    userProfileId: string;
    statusId: string;
  }) {
    return {
      ...m,
      status: membershipActive,
      roles: state.membershipRoles
        .filter((r) => r.membershipId === m.id)
        .map((r) => ({
          ...r,
          role: organizationRoles.find((x) => x.id === r.roleId) ?? owner,
          status: assignmentActive,
        })),
      branchScopes: state.branchScopes
        .filter((s) => s.membershipId === m.id)
        .map((s) => ({
          ...s,
          scopeType:
            [selected, allBranches].find((x) => x.id === s.scopeTypeId) ??
            selected,
          status: assignmentActive,
          branch: branches.find((b) => b.id === s.branchId) ?? null,
        })),
    };
  }

  // Attach for verify path that includes status on profile
  const originalFindUnique = db.userProfile.findUnique;
  db.userProfile.findUnique = async (
    args: Parameters<typeof originalFindUnique>[0],
  ) => {
    const row = await originalFindUnique(args);
    if (!row) return null;
    return { ...row, status: userActive };
  };

  return db;
}

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    BOOTSTRAP_AUTH_USER_ID: AUTH_ID,
    BOOTSTRAP_ADMIN_EMAIL: EMAIL,
    BOOTSTRAP_ADMIN_DISPLAY_NAME: "ผู้ดูแลระบบ",
    BOOTSTRAP_ORGANIZATION_CODE: "CUST-A",
    BOOTSTRAP_BRANCH_CODE: "HQ",
    ...overrides,
  };
}

function confirmedAuth() {
  return {
    id: AUTH_ID,
    email: EMAIL,
    emailConfirmedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("Phase 4B first super admin bootstrap", () => {
  it("rejects invalid UUID", () => {
    assert.equal(isValidUuid("not-a-uuid"), false);
    assert.throws(
      () => parseBootstrapEnv(baseEnv({ BOOTSTRAP_AUTH_USER_ID: "bad" })),
      (err: unknown) =>
        err instanceof BootstrapError && err.code === "INVALID_UUID",
    );
  });

  it("rejects missing auth user", async () => {
    await assert.rejects(
      () =>
        resolveBootstrapAuthUser(async () => null, parseBootstrapEnv(baseEnv())),
      (err: unknown) =>
        err instanceof BootstrapError && err.code === "AUTH_USER_NOT_FOUND",
    );
  });

  it("rejects email mismatch", async () => {
    await assert.rejects(
      () =>
        resolveBootstrapAuthUser(
          async () => ({
            id: AUTH_ID,
            email: "other@example.com",
            emailConfirmedAt: "2026-01-01T00:00:00.000Z",
          }),
          parseBootstrapEnv(baseEnv()),
        ),
      (err: unknown) =>
        err instanceof BootstrapError && err.code === "EMAIL_MISMATCH",
    );
  });

  it("rejects unconfirmed email", async () => {
    await assert.rejects(
      () =>
        resolveBootstrapAuthUser(
          async () => ({
            id: AUTH_ID,
            email: EMAIL,
            emailConfirmedAt: null,
          }),
          parseBootstrapEnv(baseEnv()),
        ),
      (err: unknown) =>
        err instanceof BootstrapError && err.code === "EMAIL_NOT_CONFIRMED",
    );
  });

  it("rejects missing organization", async () => {
    const db = createFakeDb({ orgCode: "OTHER" });
    await assert.rejects(
      () =>
        bootstrapFirstSuperAdmin({
          db: db as never,
          projectRef: "horyhrnqbeaivdztekfv",
          input: parseBootstrapEnv(baseEnv()),
          authUser: confirmedAuth(),
          dryRun: false,
        }),
      (err: unknown) =>
        err instanceof BootstrapError && err.code === "ORGANIZATION_NOT_FOUND",
    );
  });

  it("rejects branch outside organization", async () => {
    const db = createFakeDb();
    await assert.rejects(
      () =>
        bootstrapFirstSuperAdmin({
          db: db as never,
          projectRef: "horyhrnqbeaivdztekfv",
          input: parseBootstrapEnv(
            baseEnv({ BOOTSTRAP_BRANCH_CODE: "MISSING" }),
          ),
          authUser: confirmedAuth(),
          dryRun: false,
        }),
      (err: unknown) =>
        err instanceof BootstrapError && err.code === "BRANCH_NOT_FOUND",
    );
  });

  it("does not write without confirmation (dry run)", async () => {
    const db = createFakeDb();
    assert.equal(hasBootstrapConfirmation(null), false);
    assert.equal(
      hasBootstrapConfirmation(BOOTSTRAP_CONFIRM_VALUE),
      true,
    );

    const result = await bootstrapFirstSuperAdmin({
      db: db as never,
      projectRef: "horyhrnqbeaivdztekfv",
      input: parseBootstrapEnv(baseEnv({ BOOTSTRAP_CONFIRM: undefined })),
      authUser: confirmedAuth(),
      dryRun: true,
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.preview.writeOperations, "NONE");
    assert.equal(db.state.writes, 0);
    assert.equal(db.state.profiles.length, 0);
  });

  it("creates profile and assignments successfully", async () => {
    const db = createFakeDb();
    const result = await bootstrapFirstSuperAdmin({
      db: db as never,
      projectRef: "horyhrnqbeaivdztekfv",
      input: parseBootstrapEnv(
        baseEnv({ BOOTSTRAP_CONFIRM: BOOTSTRAP_CONFIRM_VALUE }),
      ),
      authUser: confirmedAuth(),
      dryRun: false,
    });

    assert.equal(result.ok, true);
    assert.equal(result.counts.profilesCreated, 1);
    assert.equal(result.counts.platformRolesCreated, 1);
    assert.equal(result.counts.membershipsCreated, 1);
    assert.equal(result.counts.membershipRolesCreated, 1);
    assert.equal(result.counts.branchScopesCreated, 1);
    assert.equal(result.counts.auditsCreated, 1);
    assert.equal(db.state.profiles.length, 1);
    assert.equal(db.state.audits.length, 1);
    assert.equal(
      (db.state.audits[0]?.afterJson as { source?: string })?.source,
      "bootstrap-script",
    );
  });

  it("is idempotent on repeat run", async () => {
    const db = createFakeDb();
    const input = parseBootstrapEnv(
      baseEnv({ BOOTSTRAP_CONFIRM: BOOTSTRAP_CONFIRM_VALUE }),
    );
    await bootstrapFirstSuperAdmin({
      db: db as never,
      projectRef: "horyhrnqbeaivdztekfv",
      input,
      authUser: confirmedAuth(),
      dryRun: false,
    });
    const writesAfterFirst = db.state.writes;
    const second = await bootstrapFirstSuperAdmin({
      db: db as never,
      projectRef: "horyhrnqbeaivdztekfv",
      input,
      authUser: confirmedAuth(),
      dryRun: false,
    });

    assert.equal(second.counts.profilesCreated, 0);
    assert.equal(second.counts.platformRolesCreated, 0);
    assert.equal(second.counts.membershipsCreated, 0);
    assert.equal(second.counts.auditsCreated, 0);
    assert.equal(db.state.profiles.length, 1);
    assert.equal(db.state.platformRoleAssignments.length, 1);
    assert.equal(db.state.memberships.length, 1);
    assert.equal(db.state.audits.length, 1);
    assert.ok(db.state.writes >= writesAfterFirst);
  });

  it("rolls back on profile conflict", async () => {
    const db = createFakeDb();
    db.state.profiles.push({
      id: randomUUID(),
      authUserId: OTHER_AUTH,
      email: EMAIL,
      displayName: "อื่น",
      statusId: db.masters.userProfileStatus[0]!.id,
    });

    await assert.rejects(
      () =>
        bootstrapFirstSuperAdmin({
          db: db as never,
          projectRef: "horyhrnqbeaivdztekfv",
          input: parseBootstrapEnv(
            baseEnv({ BOOTSTRAP_CONFIRM: BOOTSTRAP_CONFIRM_VALUE }),
          ),
          authUser: confirmedAuth(),
          dryRun: false,
        }),
      (err: unknown) =>
        err instanceof BootstrapError && err.code === "PROFILE_CONFLICT",
    );

    assert.equal(db.state.platformRoleAssignments.length, 0);
    assert.equal(db.state.memberships.length, 0);
    assert.equal(db.state.committed, false);
  });

  it("stops when SUPER_ADMIN role is missing", async () => {
    const db = createFakeDb({ omitSuperAdmin: true });
    await assert.rejects(
      () =>
        bootstrapFirstSuperAdmin({
          db: db as never,
          projectRef: "horyhrnqbeaivdztekfv",
          input: parseBootstrapEnv(
            baseEnv({ BOOTSTRAP_CONFIRM: BOOTSTRAP_CONFIRM_VALUE }),
          ),
          authUser: confirmedAuth(),
          dryRun: false,
        }),
      (err: unknown) =>
        err instanceof BootstrapError &&
        err.code === "ROLE_SUPER_ADMIN_MISSING",
    );
  });

  it("stops when OWNER role is missing", async () => {
    const db = createFakeDb({ omitOwner: true });
    await assert.rejects(
      () =>
        bootstrapFirstSuperAdmin({
          db: db as never,
          projectRef: "horyhrnqbeaivdztekfv",
          input: parseBootstrapEnv(
            baseEnv({ BOOTSTRAP_CONFIRM: BOOTSTRAP_CONFIRM_VALUE }),
          ),
          authUser: confirmedAuth(),
          dryRun: false,
        }),
      (err: unknown) =>
        err instanceof BootstrapError && err.code === "ROLE_OWNER_MISSING",
    );
  });

  it("creates audit event", async () => {
    const db = createFakeDb();
    await bootstrapFirstSuperAdmin({
      db: db as never,
      projectRef: "horyhrnqbeaivdztekfv",
      input: parseBootstrapEnv(
        baseEnv({ BOOTSTRAP_CONFIRM: BOOTSTRAP_CONFIRM_VALUE }),
      ),
      authUser: confirmedAuth(),
      dryRun: false,
    });
    assert.equal(db.state.auditActions[0]?.code, BOOTSTRAP_AUDIT_ACTION);
    assert.equal(db.state.audits.length, 1);
    const after = db.state.audits[0]?.afterJson as Record<string, unknown>;
    assert.equal(after.source, "bootstrap-script");
    assert.ok(after.timestamp);
    assert.equal(typeof after.userProfileId, "string");
  });

  it("verify script source is read-only", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "scripts/verify-first-super-admin.ts"),
      "utf8",
    );
    assert.match(src, /verifyFirstSuperAdmin/);
    assert.match(src, /Write operations: NONE/);
    assert.match(src, /loadProjectEnv/);
    assert.equal(/\$executeRawUnsafe|\$executeRaw\b/.test(src), false);
    assert.equal(/\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|\bDROP\s+TABLE\b/i.test(src), false);
    assert.equal(
      /(?:userProfile|organizationMembership|platformRoleAssignment|auditLog)\.(create|update|upsert|delete)\(/.test(
        src,
      ),
      false,
    );
    assert.equal(/bootstrapFirstSuperAdmin\s*\(/.test(src), false);
  });

  it("auth bootstrap script loads env before guard and stays dry-run without confirmation", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "scripts/bootstrap-first-super-admin.ts"),
      "utf8",
    );
    const loadIndex = src.indexOf("loadProjectEnv");
    const guardIndex = src.indexOf("env/guard");
    assert.ok(loadIndex >= 0);
    assert.ok(guardIndex > loadIndex);
    assert.match(src, /await import\(["'].*load-project-env["']\)/);
    assert.match(src, /dryRun:\s*!confirmed/);
    assert.equal(/^import\s+.*from\s+["']@prisma\/client["']/m.test(src), false);
    assert.equal(
      /^import\s+.*from\s+["'][^"']*bootstrap-first-admin["']/m.test(src),
      false,
    );
    assert.equal(/console\.(log|error)\(\s*process\.env\./.test(src), false);
  });

  it("verify succeeds after bootstrap", async () => {
    const db = createFakeDb();
    const input = parseBootstrapEnv(
      baseEnv({ BOOTSTRAP_CONFIRM: BOOTSTRAP_CONFIRM_VALUE }),
    );
    await bootstrapFirstSuperAdmin({
      db: db as never,
      projectRef: "horyhrnqbeaivdztekfv",
      input,
      authUser: confirmedAuth(),
      dryRun: false,
    });

    const verified = await verifyFirstSuperAdmin({
      db: db as never,
      input,
      authUser: confirmedAuth(),
    });
    assert.equal(verified.ok, true);
    assert.ok(verified.checks.every((c) => c.ok));
  });

  it("does not modify Resident Legacy", () => {
    assertResidentLegacyUntouched(__dirname);
  });

  it("requires branch code when organization has multiple branches", async () => {
    const db = createFakeDb({ multiBranch: true });
    await assert.rejects(
      () =>
        bootstrapFirstSuperAdmin({
          db: db as never,
          projectRef: "horyhrnqbeaivdztekfv",
          input: parseBootstrapEnv(
            baseEnv({
              BOOTSTRAP_BRANCH_CODE: "",
              BOOTSTRAP_CONFIRM: BOOTSTRAP_CONFIRM_VALUE,
            }),
          ),
          authUser: confirmedAuth(),
          dryRun: false,
        }),
      (err: unknown) =>
        err instanceof BootstrapError && err.code === "BRANCH_REQUIRED",
    );
  });
});

describe("Phase 4B Supabase Auth admin lookup diagnostics", () => {
  const okInput = { authUserId: AUTH_ID, adminEmail: EMAIL, secretKeyPresent: true };

  it("reports AUTH_ADMIN_KEY_MISSING when secret key is absent", () => {
    const outcome = evaluateAuthAdminLookup(
      { authUserId: AUTH_ID, adminEmail: EMAIL, secretKeyPresent: false },
      null,
    );
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, "AUTH_ADMIN_KEY_MISSING");
  });

  it("reports AUTH_ADMIN_KEY_INVALID when key is rejected (401)", () => {
    const outcome = evaluateAuthAdminLookup(okInput, {
      data: { user: null },
      error: { status: 401, code: "invalid_api_key", message: "Invalid API key" },
    });
    assert.equal(outcome.ok === false && outcome.code, "AUTH_ADMIN_KEY_INVALID");
    assert.equal(outcome.ok === false && outcome.httpStatus, 401);
  });

  it("reports AUTH_PROJECT_MISMATCH when error hints wrong project", () => {
    const outcome = evaluateAuthAdminLookup(okInput, {
      data: { user: null },
      error: { status: 403, code: "project_mismatch", message: "wrong project" },
    });
    assert.equal(outcome.ok === false && outcome.code, "AUTH_PROJECT_MISMATCH");
  });

  it("reports AUTH_USER_NOT_FOUND when Supabase returns no user", () => {
    const outcome = evaluateAuthAdminLookup(okInput, { data: { user: null } });
    assert.equal(outcome.ok === false && outcome.code, "AUTH_USER_NOT_FOUND");
  });

  it("reports AUTH_USER_NOT_FOUND on 404 error", () => {
    const outcome = evaluateAuthAdminLookup(okInput, {
      error: { status: 404, code: "user_not_found", message: "User not found" },
    });
    assert.equal(outcome.ok === false && outcome.code, "AUTH_USER_NOT_FOUND");
    assert.equal(outcome.ok === false && outcome.httpStatus, 404);
  });

  it("reports AUTH_USER_ID_INVALID for malformed UUID", () => {
    const outcome = evaluateAuthAdminLookup(
      { authUserId: "not-a-uuid", adminEmail: EMAIL, secretKeyPresent: true },
      null,
    );
    assert.equal(outcome.ok === false && outcome.code, "AUTH_USER_ID_INVALID");
  });

  it("reports AUTH_EMAIL_MISMATCH when email differs", () => {
    const outcome = evaluateAuthAdminLookup(okInput, {
      data: {
        user: {
          id: AUTH_ID,
          email: "someone-else@example.com",
          email_confirmed_at: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    assert.equal(outcome.ok === false && outcome.code, "AUTH_EMAIL_MISMATCH");
  });

  it("reports AUTH_EMAIL_NOT_CONFIRMED when email is unconfirmed", () => {
    const outcome = evaluateAuthAdminLookup(okInput, {
      data: { user: { id: AUTH_ID, email: EMAIL, email_confirmed_at: null } },
    });
    assert.equal(
      outcome.ok === false && outcome.code,
      "AUTH_EMAIL_NOT_CONFIRMED",
    );
  });

  it("reports AUTH_API_UNREACHABLE on network failure", () => {
    const outcome = evaluateAuthAdminLookup(
      okInput,
      null,
      new TypeError("fetch failed"),
    );
    assert.equal(outcome.ok === false && outcome.code, "AUTH_API_UNREACHABLE");
  });

  it("reports AUTH_LOOKUP_FAILED on unexpected error", () => {
    const outcome = evaluateAuthAdminLookup(
      okInput,
      null,
      new Error("something odd"),
    );
    assert.equal(outcome.ok === false && outcome.code, "AUTH_LOOKUP_FAILED");
  });

  it("returns ok with normalized user on success", () => {
    const outcome = evaluateAuthAdminLookup(okInput, {
      data: {
        user: {
          id: AUTH_ID,
          email: "Admin@Example.com",
          email_confirmed_at: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.user.id, AUTH_ID);
      assert.equal(outcome.user.email, EMAIL);
    }
  });

  it("has a Thai message for every error code", () => {
    for (const message of Object.values(AUTH_LOOKUP_MESSAGES)) {
      assert.ok(message.length > 0);
    }
  });

  it("safe diagnostic masks UUID and email and never leaks them in full", () => {
    const lines = formatAuthLookupDiagnostic(
      { ok: false, code: "AUTH_USER_NOT_FOUND", httpStatus: 404 },
      { projectRef: "horyhrnqbeaivdztekfv", authUserId: AUTH_ID, adminEmail: EMAIL },
    );
    const text = lines.join("\n");
    assert.ok(text.includes("AUTH_USER_NOT_FOUND"));
    assert.ok(text.includes("horyhrnqbeaivdztekfv"));
    assert.ok(text.includes("404"));
    assert.equal(text.includes(AUTH_ID), false);
    assert.equal(text.includes(EMAIL), false);
  });

  it("bootstrap and verify scripts use REST Auth Admin (no Realtime/WebSocket)", () => {
    const files = [
      "scripts/bootstrap-first-super-admin.ts",
      "scripts/verify-first-super-admin.ts",
    ];
    for (const file of files) {
      const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      assert.match(src, /fetchAuthAdminUserById/);
      assert.match(src, /formatAuthLookupDiagnostic/);
      assert.equal(/@supabase\/supabase-js/.test(src), false);
      assert.equal(/createClient\s*\(/.test(src), false);
      assert.equal(/RealtimeClient/.test(src), false);
      assert.equal(/\.channel\s*\(/.test(src), false);
      assert.equal(/\.realtime\b/.test(src), false);
      assert.equal(/\.subscribe\s*\(/.test(src), false);
      assert.equal(/\bfrom\s+["']ws["']/.test(src), false);
      assert.equal(/new\s+WebSocket\b/.test(src), false);
      assert.equal(
        /console\.(log|error)\([^)]*SUPABASE_SECRET_KEY/.test(src),
        false,
      );
      assert.equal(
        /console\.(log|error)\([^)]*[Aa]uthorization/i.test(src),
        false,
      );
      assert.equal(/console\.(log|error)\([^)]*input\.authUserId/.test(src), false);
    }
  });

  it("admin client utility sets auth/session flags and global.fetch without ws", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/supabase/admin.ts"),
      "utf8",
    );
    assert.match(src, /persistSession:\s*false/);
    assert.match(src, /autoRefreshToken:\s*false/);
    assert.match(src, /detectSessionInUrl:\s*false/);
    assert.match(src, /global:\s*\{\s*fetch/);
    assert.equal(/\bfrom\s+["']ws["']/.test(src), false);
    assert.equal(/transport:\s*ws/.test(src), false);
  });
});

describe("Phase 4B Auth Admin REST lookup (Node 20 safe)", () => {
  const secret = "test-secret-key-not-real";
  const supabaseUrl = "https://horyhrnqbeaivdztekfv.supabase.co";

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("looks up Auth user successfully without Realtime", async () => {
    let calledUrl = "";
    let calledMethod = "";
    const headersSeen: Record<string, string> = {};
    const outcome = await fetchAuthAdminUserById({
      supabaseUrl,
      secretKey: secret,
      authUserId: AUTH_ID,
      adminEmail: EMAIL,
      fetchImpl: async (input, init) => {
        calledUrl = String(input);
        calledMethod = init?.method ?? "GET";
        const headers = new Headers(init?.headers);
        headers.forEach((value, key) => {
          headersSeen[key.toLowerCase()] = value;
        });
        return jsonResponse(200, {
          id: AUTH_ID,
          email: EMAIL,
          email_confirmed_at: "2026-01-01T00:00:00.000Z",
        });
      },
    });
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.user.id, AUTH_ID);
      assert.equal(outcome.user.email, EMAIL);
    }
    assert.equal(calledMethod, "GET");
    assert.ok(calledUrl.includes(`/auth/v1/admin/users/${AUTH_ID}`));
    assert.equal(headersSeen.apikey, secret);
    assert.equal(headersSeen.authorization, `Bearer ${secret}`);
  });

  it("maps 401 to AUTH_ADMIN_KEY_INVALID", async () => {
    const outcome = await fetchAuthAdminUserById({
      supabaseUrl,
      secretKey: secret,
      authUserId: AUTH_ID,
      adminEmail: EMAIL,
      fetchImpl: async () =>
        jsonResponse(401, { error_code: "invalid_api_key", msg: "Invalid API key" }),
    });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, "AUTH_ADMIN_KEY_INVALID");
    assert.equal(outcome.ok === false && outcome.httpStatus, 401);
  });

  it("maps 403 to AUTH_ADMIN_KEY_INVALID", async () => {
    const outcome = await fetchAuthAdminUserById({
      supabaseUrl,
      secretKey: secret,
      authUserId: AUTH_ID,
      adminEmail: EMAIL,
      fetchImpl: async () =>
        jsonResponse(403, { message: "unauthorized" }),
    });
    assert.equal(outcome.ok === false && outcome.code, "AUTH_ADMIN_KEY_INVALID");
  });

  it("maps 404 to AUTH_USER_NOT_FOUND", async () => {
    const outcome = await fetchAuthAdminUserById({
      supabaseUrl,
      secretKey: secret,
      authUserId: AUTH_ID,
      adminEmail: EMAIL,
      fetchImpl: async () =>
        jsonResponse(404, { error_code: "user_not_found", msg: "User not found" }),
    });
    assert.equal(outcome.ok === false && outcome.code, "AUTH_USER_NOT_FOUND");
    assert.equal(outcome.ok === false && outcome.httpStatus, 404);
  });

  it("rejects invalid success response shape", async () => {
    const outcome = await fetchAuthAdminUserById({
      supabaseUrl,
      secretKey: secret,
      authUserId: AUTH_ID,
      adminEmail: EMAIL,
      fetchImpl: async () => jsonResponse(200, { unexpected: true }),
    });
    assert.equal(outcome.ok === false && outcome.code, "AUTH_RESPONSE_INVALID");
  });

  it("rejects network errors", async () => {
    const outcome = await fetchAuthAdminUserById({
      supabaseUrl,
      secretKey: secret,
      authUserId: AUTH_ID,
      adminEmail: EMAIL,
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    assert.equal(outcome.ok === false && outcome.code, "AUTH_API_UNREACHABLE");
  });

  it("rejects timeout/abort errors", async () => {
    const outcome = await fetchAuthAdminUserById({
      supabaseUrl,
      secretKey: secret,
      authUserId: AUTH_ID,
      adminEmail: EMAIL,
      fetchImpl: async () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      },
    });
    assert.equal(outcome.ok === false && outcome.code, "AUTH_API_UNREACHABLE");
  });

  it("does not require createClient / RealtimeClient on Node 20 path", () => {
    const libSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/auth/bootstrap-first-admin.ts"),
      "utf8",
    );
    assert.match(libSrc, /fetchAuthAdminUserById/);
    assert.match(libSrc, /auth\/v1\/admin\/users/);
    assert.equal(/from\s+["']@supabase\/supabase-js["']/.test(libSrc), false);
    assert.equal(/new\s+RealtimeClient\s*\(/.test(libSrc), false);
    assert.equal(/from\s+["']@supabase\/realtime-js["']/.test(libSrc), false);
    assert.equal(/\bfrom\s+["']ws["']/.test(libSrc), false);
    // No live SDK client construction in this module.
    assert.equal(
      /(?:^|\n)\s*(?:const|let|var)\s+\w+\s*=\s*createClient\s*\(/.test(libSrc),
      false,
    );
  });

  it("safe diagnostics still mask secrets after REST failures", async () => {
    const outcome = await fetchAuthAdminUserById({
      supabaseUrl,
      secretKey: secret,
      authUserId: AUTH_ID,
      adminEmail: EMAIL,
      fetchImpl: async () =>
        jsonResponse(401, { msg: "Invalid API key", token: secret }),
    });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      const text = formatAuthLookupDiagnostic(outcome, {
        projectRef: "horyhrnqbeaivdztekfv",
        authUserId: AUTH_ID,
        adminEmail: EMAIL,
      }).join("\n");
      assert.equal(text.includes(secret), false);
      assert.equal(text.includes(AUTH_ID), false);
      assert.equal(text.includes(EMAIL), false);
      assert.equal(text.includes("Bearer"), false);
    }
  });
});
