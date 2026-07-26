import type { Prisma, PrismaClient } from "@prisma/client";

import { MASTER } from "@/lib/platform/master-codes";

type Db = PrismaClient | Prisma.TransactionClient;

const auditActionIdCache = new Map<string, string>();
const auditActionInFlight = new Map<string, Promise<string>>();

const AUDIT_LABELS: Record<string, { nameTh: string; nameEn: string }> = {
  [MASTER.auditActionType.ORGANIZATION_CREATE]: {
    nameTh: "สร้างองค์กร",
    nameEn: "Create organization",
  },
  [MASTER.auditActionType.ORGANIZATION_UPDATE]: {
    nameTh: "แก้ไของค์กร",
    nameEn: "Update organization",
  },
  [MASTER.auditActionType.ORGANIZATION_SUSPEND]: {
    nameTh: "ระงับองค์กร",
    nameEn: "Suspend organization",
  },
  [MASTER.auditActionType.BRANCH_CREATE]: {
    nameTh: "สร้างสาขา",
    nameEn: "Create branch",
  },
  [MASTER.auditActionType.BRANCH_UPDATE]: {
    nameTh: "แก้ไขสาขา",
    nameEn: "Update branch",
  },
  [MASTER.auditActionType.BRANCH_SUSPEND]: {
    nameTh: "ระงับสาขา",
    nameEn: "Suspend branch",
  },
  [MASTER.auditActionType.USER_INVITE]: {
    nameTh: "เชิญผู้ใช้งาน",
    nameEn: "Invite user",
  },
  [MASTER.auditActionType.USER_REINVITE]: {
    nameTh: "ส่งคำเชิญอีกครั้ง",
    nameEn: "Reinvite user",
  },
  [MASTER.auditActionType.USER_INVITE_REQUESTED]: {
    nameTh: "ร้องขอส่งคำเชิญ",
    nameEn: "User invite requested",
  },
  [MASTER.auditActionType.USER_INVITE_SENT]: {
    nameTh: "ส่งคำเชิญแล้ว",
    nameEn: "User invite sent",
  },
  [MASTER.auditActionType.USER_INVITE_FAILED]: {
    nameTh: "ส่งคำเชิญไม่สำเร็จ",
    nameEn: "User invite failed",
  },
  [MASTER.auditActionType.USER_REINVITE_REQUESTED]: {
    nameTh: "ร้องขอส่งคำเชิญอีกครั้ง",
    nameEn: "User reinvite requested",
  },
  [MASTER.auditActionType.USER_REINVITE_SENT]: {
    nameTh: "ส่งคำเชิญอีกครั้งแล้ว",
    nameEn: "User reinvite sent",
  },
  [MASTER.auditActionType.USER_REINVITE_FAILED]: {
    nameTh: "ส่งคำเชิญอีกครั้งไม่สำเร็จ",
    nameEn: "User reinvite failed",
  },
  [MASTER.auditActionType.USER_INVITE_ACCEPTED]: {
    nameTh: "ยอมรับคำเชิญ",
    nameEn: "User invite accepted",
  },
  [MASTER.auditActionType.USER_PLATFORM_SETUP_COMPLETED]: {
    nameTh: "จัดเตรียมสิทธิ์สำเร็จ",
    nameEn: "User platform setup completed",
  },
  [MASTER.auditActionType.USER_PLATFORM_SETUP_FAILED]: {
    nameTh: "จัดเตรียมสิทธิ์ไม่สำเร็จ",
    nameEn: "User platform setup failed",
  },
  [MASTER.auditActionType.USER_ACTIVATE]: {
    nameTh: "เปิดใช้งานบัญชี",
    nameEn: "Activate user",
  },
  [MASTER.auditActionType.USER_SUSPEND]: {
    nameTh: "ระงับบัญชี",
    nameEn: "Suspend user",
  },
  [MASTER.auditActionType.MEMBERSHIP_CREATE]: {
    nameTh: "สร้างสมาชิกองค์กร",
    nameEn: "Create membership",
  },
  [MASTER.auditActionType.MEMBERSHIP_UPDATE]: {
    nameTh: "แก้ไขสมาชิกองค์กร",
    nameEn: "Update membership",
  },
  [MASTER.auditActionType.ROLE_ASSIGN]: {
    nameTh: "กำหนดบทบาท",
    nameEn: "Assign role",
  },
  [MASTER.auditActionType.ROLE_REMOVE]: {
    nameTh: "ยกเลิกบทบาท",
    nameEn: "Remove role",
  },
  [MASTER.auditActionType.CONTEXT_SWITCH]: {
    nameTh: "เปลี่ยนองค์กร/สาขา",
    nameEn: "Switch context",
  },
  [MASTER.auditActionType.CONTEXT_PLATFORM_ADMIN]: {
    nameTh: "สลับโหมดผู้ดูแลแพลตฟอร์ม",
    nameEn: "Switch platform admin context",
  },
  [MASTER.auditActionType.STAFF_PORTFOLIO_ASSIGN]: {
    nameTh: "กำหนดองค์กรลูกค้าให้พนักงาน",
    nameEn: "Assign customer organization to staff",
  },
  [MASTER.auditActionType.STAFF_PORTFOLIO_REVOKE]: {
    nameTh: "ถอดองค์กรลูกค้าจากพนักงาน",
    nameEn: "Revoke customer organization from staff",
  },
};

/** Keys that must never appear in audit JSON payloads. */
const SENSITIVE_KEY_RE =
  /(password|secret|token|authorization|apikey|api_key|connectionstring|database_url|direct_url)/i;

export function sanitizeAuditJson(
  value: unknown,
): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return scrub(value) as Prisma.InputJsonValue;
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(key)) continue;
      out[key] = scrub(child);
    }
    return out;
  }
  return value;
}

export async function ensureAuditActionType(
  db: Db,
  code: string,
): Promise<string> {
  const cached = auditActionIdCache.get(code);
  if (cached) return cached;

  const inFlight = auditActionInFlight.get(code);
  if (inFlight) return inFlight;

  const labels = AUDIT_LABELS[code] ?? {
    nameTh: code,
    nameEn: code,
  };

  const promise = db.auditActionType
    .upsert({
      where: { code },
      create: {
        code,
        nameTh: labels.nameTh,
        nameEn: labels.nameEn,
        isSystem: true,
        isActive: true,
        sortOrder: 100,
      },
      update: {},
    })
    .then((row) => {
      auditActionIdCache.set(code, row.id);
      return row.id;
    })
    .finally(() => {
      auditActionInFlight.delete(code);
    });

  auditActionInFlight.set(code, promise);
  return promise;
}

export async function writeAuditLog(
  db: Db,
  input: {
    organizationId?: string | null;
    actorAuthUserId: string;
    actionCode: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  const actionTypeId = await ensureAuditActionType(db, input.actionCode);
  await db.auditLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      actorAuthUserId: input.actorAuthUserId,
      actionTypeId,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeJson: sanitizeAuditJson(input.before),
      afterJson: sanitizeAuditJson(input.after),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
