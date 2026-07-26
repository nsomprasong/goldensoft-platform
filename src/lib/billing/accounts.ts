import type { Prisma, PrismaClient } from "@prisma/client";

import { BillingError, BILLING_CODES } from "@/lib/billing/codes";
import { money, serializeMoney } from "@/lib/billing/money";
import { writeAuditLog } from "@/lib/platform/audit";

type Db = PrismaClient | Prisma.TransactionClient;

async function statusIdByCode(db: Db, code: string): Promise<string> {
  const row = await db.billingAccountStatus.findUnique({ where: { code } });
  if (!row) {
    throw new BillingError(
      "MASTER_MISSING",
      `ไม่พบสถานะบัญชีการเงิน ${code}`,
      500,
    );
  }
  return row.id;
}

export async function getBillingAccount(db: Db, organizationId: string) {
  return db.billingAccount.findUnique({
    where: { organizationId },
    include: { status: true },
  });
}

export async function ensureBillingAccount(
  db: PrismaClient,
  input: {
    organizationId: string;
    currency?: string;
    actorAuthUserId: string | null;
    creditLimit?: string | number | null;
  },
) {
  const existing = await getBillingAccount(db, input.organizationId);
  if (existing) return existing;

  const org = await db.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, currency: true, deletedAt: true },
  });
  if (!org || org.deletedAt) {
    throw new BillingError("ORG_NOT_FOUND", "ไม่พบองค์กร", 404);
  }

  const statusId = await statusIdByCode(db, BILLING_CODES.accountStatus.ACTIVE);
  const account = await db.billingAccount.create({
    data: {
      organizationId: org.id,
      currency: input.currency ?? org.currency ?? "THB",
      statusId,
      currentBalanceSnapshot: money(0),
      creditLimit:
        input.creditLimit == null || input.creditLimit === ""
          ? null
          : money(input.creditLimit),
    },
    include: { status: true },
  });

  await writeAuditLog(db, {
    organizationId: org.id,
    actorAuthUserId: input.actorAuthUserId ?? "system",
    actionCode: "billing.account.create",
    entityType: "billing_account",
    entityId: account.id,
    after: {
      organizationId: org.id,
      currency: account.currency,
      status: BILLING_CODES.accountStatus.ACTIVE,
    },
  });

  return account;
}

export function serializeBillingAccount(
  account: NonNullable<Awaited<ReturnType<typeof getBillingAccount>>>,
) {
  return {
    id: account.id,
    organizationId: account.organizationId,
    currency: account.currency,
    status: account.status.code,
    currentBalanceSnapshot: serializeMoney(account.currentBalanceSnapshot),
    creditLimit: serializeMoney(account.creditLimit),
    allowNegativeBalance: account.allowNegativeBalance,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}
