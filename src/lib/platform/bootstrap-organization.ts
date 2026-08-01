import type { Prisma, PrismaClient } from "@prisma/client";

import { MASTER } from "@/lib/platform/master-codes";
import { getMasterByCode } from "@/lib/platform/master-data";

export const ORG_BOOTSTRAP_CONFIRM_VALUE = "CREATE_GOLDENSOFT_ORGANIZATION";
export const ORG_BOOTSTRAP_AUDIT_ACTION = "bootstrap.goldensoft_organization";
export const ORG_BOOTSTRAP_SOURCE = "bootstrap-script";

/**
 * Fixed business definition for the GoldenSoft organization and first branch.
 * Schema stores a single Thai/English pair via displayName/legalName and a
 * single branch `name`, so the Thai label is authoritative for display.
 */
export const GOLDENSOFT_ORG = {
  customerCode: "GOLDENSOFT",
  slug: "goldensoft",
  nameTh: "โกลเด้นซอฟต์",
  nameEn: "GoldenSoft",
} as const;

/** True when this organization is GoldenSoft itself (Platform Admin home). */
export function isGoldenSoftCustomerCode(
  customerCode: string | null | undefined,
): boolean {
  return (customerCode ?? "").trim().toUpperCase() === GOLDENSOFT_ORG.customerCode;
}

export const GOLDENSOFT_BRANCH = {
  code: "GOLDENSOFT-01",
  nameTh: "สาขาที่ 1",
  nameEn: "Branch 1",
} as const;

export type OrgBootstrapErrorCode =
  | "MASTER_MISSING"
  | "ORGANIZATION_CONFLICT"
  | "BRANCH_CONFLICT"
  | "BRANCH_WRONG_ORGANIZATION";

export class OrgBootstrapError extends Error {
  readonly code: OrgBootstrapErrorCode;

  constructor(code: OrgBootstrapErrorCode, message: string) {
    super(message);
    this.name = "OrgBootstrapError";
    this.code = code;
  }
}

export type OrgPlannedChange =
  | "สร้างองค์กรใหม่"
  | "ใช้ซ้ำองค์กรเดิม"
  | "สร้างสาขาใหม่"
  | "ใช้ซ้ำสาขาเดิม"
  | "บันทึกเหตุการณ์ audit";

export type OrgBootstrapPreview = {
  projectRef: string;
  organizationCode: string;
  organizationNameTh: string;
  branchCode: string;
  branchNameTh: string;
  changes: OrgPlannedChange[];
  writeOperations: "NONE" | "TRANSACTION";
  confirmed: boolean;
};

export type OrgBootstrapCounts = {
  organizationsCreated: number;
  branchesCreated: number;
  auditsCreated: number;
  reused: number;
};

export type OrgBootstrapResult = {
  ok: true;
  dryRun: boolean;
  preview: OrgBootstrapPreview;
  counts: OrgBootstrapCounts;
  maskedOrganizationId: string | null;
  maskedBranchId: string | null;
};

export type OrgVerifyCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type OrgVerifyResult = {
  ok: boolean;
  checks: OrgVerifyCheck[];
};

type DbClient = PrismaClient;
type TxClient = Prisma.TransactionClient;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function maskUuid(id: string): string {
  if (!UUID_RE.test(id)) return "********";
  return `${id.slice(0, 8)}-****-****-****-${id.slice(-4)}`;
}

function emptyCounts(): OrgBootstrapCounts {
  return {
    organizationsCreated: 0,
    branchesCreated: 0,
    auditsCreated: 0,
    reused: 0,
  };
}

async function requireMaster(
  db: TxClient | DbClient,
  table: "organizationStatus" | "branchStatus",
  code: string,
  thaiMessage: string,
): Promise<{ id: string; code: string }> {
  const row = await getMasterByCode(db as DbClient, table, code);
  if (!row || !row.isActive) {
    throw new OrgBootstrapError("MASTER_MISSING", thaiMessage);
  }
  return { id: row.id, code: row.code };
}

async function ensureAuditAction(tx: TxClient) {
  return tx.auditActionType.upsert({
    where: { code: ORG_BOOTSTRAP_AUDIT_ACTION },
    create: {
      code: ORG_BOOTSTRAP_AUDIT_ACTION,
      nameTh: "สร้างองค์กร GoldenSoft ครั้งแรก",
      nameEn: "Bootstrap GoldenSoft organization",
      sortOrder: 210,
      isActive: true,
      isSystem: true,
    },
    update: {},
  });
}

export function buildOrgPreview(input: {
  projectRef: string;
  confirmed: boolean;
  organizationWillCreate: boolean;
  branchWillCreate: boolean;
}): OrgBootstrapPreview {
  const changes: OrgPlannedChange[] = [
    input.organizationWillCreate ? "สร้างองค์กรใหม่" : "ใช้ซ้ำองค์กรเดิม",
    input.branchWillCreate ? "สร้างสาขาใหม่" : "ใช้ซ้ำสาขาเดิม",
    "บันทึกเหตุการณ์ audit",
  ];

  return {
    projectRef: input.projectRef,
    organizationCode: GOLDENSOFT_ORG.customerCode,
    organizationNameTh: GOLDENSOFT_ORG.nameTh,
    branchCode: GOLDENSOFT_BRANCH.code,
    branchNameTh: GOLDENSOFT_BRANCH.nameTh,
    changes,
    writeOperations: input.confirmed ? "TRANSACTION" : "NONE",
    confirmed: input.confirmed,
  };
}

export function formatOrgPreviewThai(preview: OrgBootstrapPreview): string[] {
  const lines = [
    "=== ตัวอย่างก่อนสร้างองค์กร GoldenSoft ===",
    `โปรเจกต์ Supabase ที่กำลังเชื่อมต่อ: ${preview.projectRef}`,
    `รหัสองค์กร: ${preview.organizationCode}`,
    `ชื่อองค์กร: ${preview.organizationNameTh}`,
    `รหัสสาขา: ${preview.branchCode}`,
    `ชื่อสาขา: ${preview.branchNameTh}`,
    "สิ่งที่จะสร้างหรือ reuse:",
    ...preview.changes.map((c) => `  - ${c}`),
    `Write operations: ${preview.writeOperations}`,
  ];

  if (!preview.confirmed) {
    lines.push("ยังไม่มีการเขียนข้อมูล");
    lines.push(
      `ตั้ง ORGANIZATION_BOOTSTRAP_CONFIRM=${ORG_BOOTSTRAP_CONFIRM_VALUE} เพื่อยืนยันการเขียน`,
    );
  } else {
    lines.push("พร้อมสร้างองค์กร GoldenSoft");
  }

  return lines;
}

type ExistingBranch = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  status: { code: string };
};

async function resolveExisting(db: TxClient | DbClient) {
  const organization = await db.organization.findFirst({
    where: { customerCode: GOLDENSOFT_ORG.customerCode, deletedAt: null },
    include: { status: true },
  });

  if (organization) {
    const conflictName =
      organization.displayName !== GOLDENSOFT_ORG.nameTh ||
      organization.legalName !== GOLDENSOFT_ORG.nameEn;
    if (conflictName || organization.status.code !== MASTER.organizationStatus.ACTIVE) {
      throw new OrgBootstrapError(
        "ORGANIZATION_CONFLICT",
        "พบองค์กรรหัส GOLDENSOFT ที่มีชื่อหรือสถานะไม่ตรงกัน — หยุดและ rollback",
      );
    }
  }

  // Branch code is unique per organization; check globally to guard cross-org reuse.
  const branchByCode = (await db.branch.findFirst({
    where: { code: GOLDENSOFT_BRANCH.code, deletedAt: null },
    include: { status: true },
  })) as ExistingBranch | null;

  if (branchByCode && organization && branchByCode.organizationId !== organization.id) {
    throw new OrgBootstrapError(
      "BRANCH_WRONG_ORGANIZATION",
      "พบสาขารหัส GOLDENSOFT-01 อยู่ภายใต้องค์กรอื่น — หยุดและ rollback",
    );
  }

  if (branchByCode && !organization) {
    throw new OrgBootstrapError(
      "BRANCH_WRONG_ORGANIZATION",
      "พบสาขารหัส GOLDENSOFT-01 แต่ไม่พบองค์กร GOLDENSOFT — หยุดและ rollback",
    );
  }

  if (branchByCode && organization) {
    const conflict =
      branchByCode.name !== GOLDENSOFT_BRANCH.nameTh ||
      branchByCode.status.code !== MASTER.branchStatus.ACTIVE;
    if (conflict) {
      throw new OrgBootstrapError(
        "BRANCH_CONFLICT",
        "พบสาขารหัส GOLDENSOFT-01 ที่มีชื่อหรือสถานะไม่ตรงกัน — หยุดและ rollback",
      );
    }
  }

  return { organization, branch: branchByCode };
}

/**
 * Dry-run or execute the GoldenSoft organization + branch bootstrap in a single
 * transaction. Idempotent: matching rows are reused, conflicts fail closed.
 */
export async function bootstrapGoldensoftOrganization(options: {
  db: DbClient;
  projectRef: string;
  dryRun: boolean;
}): Promise<OrgBootstrapResult> {
  const run = async (
    tx: TxClient,
    counts: OrgBootstrapCounts,
    dryRun: boolean,
  ) => {
    const orgActive = await requireMaster(
      tx,
      "organizationStatus",
      MASTER.organizationStatus.ACTIVE,
      "ไม่พบสถานะองค์กร ACTIVE",
    );
    const branchActive = await requireMaster(
      tx,
      "branchStatus",
      MASTER.branchStatus.ACTIVE,
      "ไม่พบสถานะสาขา ACTIVE",
    );

    const existing = await resolveExisting(tx);

    let organizationId = existing.organization?.id ?? null;
    if (existing.organization) {
      counts.reused += 1;
    } else if (!dryRun) {
      const org = await tx.organization.create({
        data: {
          customerCode: GOLDENSOFT_ORG.customerCode,
          slug: GOLDENSOFT_ORG.slug,
          legalName: GOLDENSOFT_ORG.nameEn,
          displayName: GOLDENSOFT_ORG.nameTh,
          statusId: orgActive.id,
        },
      });
      organizationId = org.id;
      counts.organizationsCreated += 1;
    } else {
      counts.organizationsCreated += 1;
    }

    let branchId = existing.branch?.id ?? null;
    if (existing.branch) {
      counts.reused += 1;
    } else if (!dryRun) {
      if (!organizationId) {
        throw new OrgBootstrapError(
          "ORGANIZATION_CONFLICT",
          "ไม่สามารถกำหนดองค์กรสำหรับสาขาได้",
        );
      }
      const branch = await tx.branch.create({
        data: {
          organizationId,
          code: GOLDENSOFT_BRANCH.code,
          name: GOLDENSOFT_BRANCH.nameTh,
          statusId: branchActive.id,
        },
      });
      branchId = branch.id;
      counts.branchesCreated += 1;
    } else {
      counts.branchesCreated += 1;
    }

    if (!dryRun) {
      if (!organizationId) {
        throw new OrgBootstrapError(
          "ORGANIZATION_CONFLICT",
          "ไม่สามารถกำหนดองค์กรสำหรับ audit ได้",
        );
      }
      const auditAction = await ensureAuditAction(tx);
      const existingAudit = await tx.auditLog.findFirst({
        where: {
          actionTypeId: auditAction.id,
          entityType: "Organization",
          entityId: organizationId,
          organizationId,
        },
      });

      if (existingAudit) {
        counts.reused += 1;
      } else {
        await tx.auditLog.create({
          data: {
            organizationId,
            actionTypeId: auditAction.id,
            entityType: "Organization",
            entityId: organizationId,
            afterJson: {
              organizationCode: GOLDENSOFT_ORG.customerCode,
              branchCode: GOLDENSOFT_BRANCH.code,
              source: ORG_BOOTSTRAP_SOURCE,
              timestamp: new Date().toISOString(),
              organizationCreated: counts.organizationsCreated > 0,
              branchCreated: counts.branchesCreated > 0,
            },
            userAgent: ORG_BOOTSTRAP_SOURCE,
          },
        });
        counts.auditsCreated += 1;
      }
    }

    return { organizationId, branchId };
  };

  if (options.dryRun) {
    let organizationWillCreate = false;
    let branchWillCreate = false;
    await options.db.$transaction(async (tx) => {
      const counts = emptyCounts();
      await run(tx, counts, true);
      organizationWillCreate = counts.organizationsCreated > 0;
      branchWillCreate = counts.branchesCreated > 0;
    });

    return {
      ok: true,
      dryRun: true,
      preview: buildOrgPreview({
        projectRef: options.projectRef,
        confirmed: false,
        organizationWillCreate,
        branchWillCreate,
      }),
      counts: emptyCounts(),
      maskedOrganizationId: null,
      maskedBranchId: null,
    };
  }

  const counts = emptyCounts();
  const result = await options.db.$transaction(async (tx) => {
    return run(tx, counts, false);
  });

  return {
    ok: true,
    dryRun: false,
    preview: buildOrgPreview({
      projectRef: options.projectRef,
      confirmed: true,
      organizationWillCreate: counts.organizationsCreated > 0,
      branchWillCreate: counts.branchesCreated > 0,
    }),
    counts,
    maskedOrganizationId: result.organizationId
      ? maskUuid(result.organizationId)
      : null,
    maskedBranchId: result.branchId ? maskUuid(result.branchId) : null,
  };
}

export async function verifyGoldensoftOrganization(options: {
  db: DbClient;
}): Promise<OrgVerifyResult> {
  const checks: OrgVerifyCheck[] = [];
  const push = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
  };

  const organizations = await options.db.organization.findMany({
    where: { customerCode: GOLDENSOFT_ORG.customerCode, deletedAt: null },
    include: { status: true },
  });

  push(
    "organization_unique",
    organizations.length === 1,
    organizations.length === 1
      ? "พบองค์กรรหัส GOLDENSOFT เพียง 1 รายการ"
      : organizations.length === 0
        ? "ไม่พบองค์กรรหัส GOLDENSOFT"
        : "พบองค์กรรหัส GOLDENSOFT ซ้ำ",
  );

  const organization = organizations[0] ?? null;
  if (!organization) {
    return { ok: false, checks };
  }

  push(
    "organization_name_th",
    organization.displayName === GOLDENSOFT_ORG.nameTh,
    organization.displayName === GOLDENSOFT_ORG.nameTh
      ? "ชื่อไทยองค์กรคือ โกลเด้นซอฟต์"
      : "ชื่อไทยองค์กรไม่ตรงกับ โกลเด้นซอฟต์",
  );

  push(
    "organization_active",
    organization.status.code === MASTER.organizationStatus.ACTIVE,
    organization.status.code === MASTER.organizationStatus.ACTIVE
      ? "องค์กรอยู่ในสถานะใช้งาน"
      : "องค์กรไม่ได้อยู่ในสถานะใช้งาน",
  );

  const branchesByCode = await options.db.branch.findMany({
    where: { code: GOLDENSOFT_BRANCH.code, deletedAt: null },
    include: { status: true },
  });

  push(
    "branch_unique",
    branchesByCode.length === 1,
    branchesByCode.length === 1
      ? "พบสาขารหัส GOLDENSOFT-01 เพียง 1 รายการ"
      : branchesByCode.length === 0
        ? "ไม่พบสาขารหัส GOLDENSOFT-01"
        : "พบสาขารหัส GOLDENSOFT-01 ซ้ำ",
  );

  const branch = branchesByCode[0] ?? null;
  if (!branch) {
    return { ok: false, checks };
  }

  push(
    "branch_belongs_to_org",
    branch.organizationId === organization.id,
    branch.organizationId === organization.id
      ? "สาขาผูกกับองค์กร GOLDENSOFT"
      : "สาขาไม่ได้ผูกกับองค์กร GOLDENSOFT",
  );

  push(
    "branch_name_th",
    branch.name === GOLDENSOFT_BRANCH.nameTh,
    branch.name === GOLDENSOFT_BRANCH.nameTh
      ? "ชื่อไทยสาขาคือ สาขาที่ 1"
      : "ชื่อไทยสาขาไม่ตรงกับ สาขาที่ 1",
  );

  push(
    "branch_active",
    branch.status.code === MASTER.branchStatus.ACTIVE,
    branch.status.code === MASTER.branchStatus.ACTIVE
      ? "สาขาอยู่ในสถานะใช้งาน"
      : "สาขาไม่ได้อยู่ในสถานะใช้งาน",
  );

  const auditAction = await options.db.auditActionType.findUnique({
    where: { code: ORG_BOOTSTRAP_AUDIT_ACTION },
  });
  const auditCount = auditAction
    ? await options.db.auditLog.count({
        where: {
          actionTypeId: auditAction.id,
          entityType: "Organization",
          entityId: organization.id,
        },
      })
    : 0;

  push(
    "audit_event",
    auditCount >= 1,
    auditCount >= 1
      ? "พบเหตุการณ์ audit ของการสร้างองค์กร"
      : "ไม่พบเหตุการณ์ audit ของการสร้างองค์กร",
  );

  const ok = checks.every((c) => c.ok);
  return { ok, checks };
}
