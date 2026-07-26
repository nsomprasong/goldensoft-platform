import { Prisma, type PrismaClient } from "@prisma/client";

import { getBillingAccount } from "@/lib/billing/accounts";
import { BillingError, BILLING_CODES } from "@/lib/billing/codes";
import {
  applyDirection,
  foldLedgerBalance,
  money,
  parsePositiveAmount,
  serializeMoney,
  type Money,
} from "@/lib/billing/money";
import { writeAuditLog } from "@/lib/platform/audit";

type Db = PrismaClient;

async function masterIds(db: Prisma.TransactionClient) {
  const [types, directions] = await Promise.all([
    db.creditTransactionType.findMany(),
    db.creditDirection.findMany(),
  ]);
  const typeByCode = Object.fromEntries(types.map((t) => [t.code, t.id]));
  const directionByCode = Object.fromEntries(
    directions.map((d) => [d.code, d.id]),
  );
  return { typeByCode, directionByCode };
}

export async function getCreditBalance(db: Db, organizationId: string) {
  const account = await getBillingAccount(db, organizationId);
  if (!account) return null;
  const balance = account.currentBalanceSnapshot ?? money(0);
  const limit = account.creditLimit;
  const availableCredit = limit == null ? balance : balance.plus(limit);
  return {
    accountId: account.id,
    organizationId,
    currency: account.currency,
    balance,
    creditLimit: limit,
    availableCredit,
    allowNegativeBalance: account.allowNegativeBalance,
    status: account.status.code,
  };
}

export async function listCreditTransactions(
  db: Db,
  input: {
    organizationId: string;
    transactionTypeCode?: string;
    from?: Date;
    to?: Date;
    skip?: number;
    take?: number;
  },
) {
  const account = await getBillingAccount(db, input.organizationId);
  if (!account) {
    return { total: 0, rows: [] as never[] };
  }
  const where: Prisma.CreditTransactionWhereInput = {
    billingAccountId: account.id,
  };
  if (input.transactionTypeCode) {
    where.transactionType = { code: input.transactionTypeCode };
  }
  if (input.from || input.to) {
    where.effectiveAt = {};
    if (input.from) where.effectiveAt.gte = input.from;
    if (input.to) where.effectiveAt.lte = input.to;
  }
  const take = Math.min(input.take ?? 50, 100);
  const skip = input.skip ?? 0;
  const [total, rows] = await Promise.all([
    db.creditTransaction.count({ where }),
    db.creditTransaction.findMany({
      where,
      include: { transactionType: true, direction: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);
  return { total, rows };
}

export async function reconcileBalanceSnapshot(
  db: Db,
  billingAccountId: string,
): Promise<Money> {
  const rows = await db.creditTransaction.findMany({
    where: { billingAccountId },
    include: { direction: true },
    orderBy: { createdAt: "asc" },
  });
  const balance = foldLedgerBalance(
    rows.map((row) => ({
      amount: row.amount,
      direction: row.direction.code as "CREDIT" | "DEBIT",
    })),
  );
  await db.billingAccount.update({
    where: { id: billingAccountId },
    data: { currentBalanceSnapshot: balance },
  });
  return balance;
}

export async function adjustCredit(
  db: Db,
  input: {
    organizationId: string;
    direction: "CREDIT" | "DEBIT";
    amount: unknown;
    reason: string;
    transactionTypeCode?: string;
    actorAuthUserId: string;
    idempotencyKey?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
    metadata?: Prisma.InputJsonValue;
    allowCreateAccount?: boolean;
    reversesTransactionId?: string | null;
  },
) {
  const reason = input.reason.trim();
  if (!reason) {
    throw new BillingError("REASON_REQUIRED", "ต้องระบุเหตุผลในการปรับเครดิต");
  }
  const amount = parsePositiveAmount(input.amount);
  const typeCode =
    input.transactionTypeCode ??
    (input.direction === "CREDIT"
      ? BILLING_CODES.transactionType.ADJUSTMENT_CREDIT
      : BILLING_CODES.transactionType.ADJUSTMENT_DEBIT);

  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      Array<{
        id: string;
        organization_id: string;
        currency: string;
        current_balance_snapshot: Prisma.Decimal | null;
        allow_negative_balance: boolean;
      }>
    >`
      SELECT id, organization_id, currency, current_balance_snapshot, allow_negative_balance
      FROM platform.billing_accounts
      WHERE organization_id = ${input.organizationId}::uuid
      FOR UPDATE
    `;

    let account = locked[0];
    if (!account) {
      if (!input.allowCreateAccount) {
        throw new BillingError(
          "ACCOUNT_MISSING",
          "ยังไม่มีบัญชีการเงินสำหรับองค์กรนี้",
          404,
        );
      }
      const status = await tx.billingAccountStatus.findUnique({
        where: { code: BILLING_CODES.accountStatus.ACTIVE },
      });
      if (!status) {
        throw new BillingError("MASTER_MISSING", "ไม่พบสถานะบัญชีการเงิน", 500);
      }
      const created = await tx.billingAccount.create({
        data: {
          organizationId: input.organizationId,
          currency: "THB",
          statusId: status.id,
          currentBalanceSnapshot: money(0),
        },
      });
      account = {
        id: created.id,
        organization_id: created.organizationId,
        currency: created.currency,
        current_balance_snapshot: created.currentBalanceSnapshot,
        allow_negative_balance: created.allowNegativeBalance,
      };
    }

    if (input.idempotencyKey) {
      const existing = await tx.creditTransaction.findFirst({
        where: {
          billingAccountId: account.id,
          idempotencyKey: input.idempotencyKey,
        },
        include: { transactionType: true, direction: true },
      });
      if (existing) return { transaction: existing, idempotent: true as const };
    }

    const { typeByCode, directionByCode } = await masterIds(tx);
    const typeId = typeByCode[typeCode];
    const directionId = directionByCode[input.direction];
    if (!typeId || !directionId) {
      throw new BillingError("MASTER_MISSING", "ไม่พบประเภทธุรกรรมเครดิต", 500);
    }

    const balanceBefore = account.current_balance_snapshot ?? money(0);
    const balanceAfter = applyDirection(
      balanceBefore,
      amount,
      input.direction,
    );
    if (balanceAfter.lt(0) && !account.allow_negative_balance) {
      throw new BillingError(
        "INSUFFICIENT_CREDIT",
        "เครดิตคงเหลือไม่พอ และไม่อนุญาตให้ติดลบ",
      );
    }

    const transaction = await tx.creditTransaction.create({
      data: {
        billingAccountId: account.id,
        organizationId: account.organization_id,
        transactionTypeId: typeId,
        directionId,
        amount,
        currency: account.currency,
        balanceBefore,
        balanceAfter,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        reason,
        metadata: input.metadata ?? {},
        createdBy: input.actorAuthUserId,
        idempotencyKey: input.idempotencyKey ?? null,
        reversesTransactionId: input.reversesTransactionId ?? null,
      },
      include: { transactionType: true, direction: true },
    });

    await tx.billingAccount.update({
      where: { id: account.id },
      data: { currentBalanceSnapshot: balanceAfter },
    });

    await writeAuditLog(tx, {
      organizationId: account.organization_id,
      actorAuthUserId: input.actorAuthUserId,
      actionCode: "billing.credit.adjust",
      entityType: "credit_transaction",
      entityId: transaction.id,
      after: {
        direction: input.direction,
        amount: serializeMoney(amount),
        balanceAfter: serializeMoney(balanceAfter),
        reason,
        typeCode,
      },
    });

    return { transaction, idempotent: false as const };
  });
}

export async function reverseCreditTransaction(
  db: Db,
  input: {
    transactionId: string;
    actorAuthUserId: string;
    reason: string;
    idempotencyKey?: string | null;
  },
) {
  const reason = input.reason.trim();
  if (!reason) {
    throw new BillingError("REASON_REQUIRED", "ต้องระบุเหตุผลในการกลับรายการ");
  }

  const original = await db.creditTransaction.findUnique({
    where: { id: input.transactionId },
    include: { direction: true },
  });
  if (!original) {
    throw new BillingError("NOT_FOUND", "ไม่พบรายการเครดิต", 404);
  }
  const already = await db.creditTransaction.findFirst({
    where: { reversesTransactionId: original.id },
  });
  if (already) {
    throw new BillingError("ALREADY_REVERSED", "รายการนี้ถูกกลับรายการแล้ว");
  }

  const reverseDirection =
    original.direction.code === "CREDIT" ? "DEBIT" : "CREDIT";

  const result = await adjustCredit(db, {
    organizationId: original.organizationId,
    direction: reverseDirection,
    amount: original.amount,
    reason,
    transactionTypeCode: BILLING_CODES.transactionType.REVERSAL,
    actorAuthUserId: input.actorAuthUserId,
    idempotencyKey: input.idempotencyKey ?? `reverse:${original.id}`,
    referenceType: "credit_transaction",
    referenceId: original.id,
    metadata: { reversesTransactionId: original.id },
    reversesTransactionId: original.id,
  });

  await writeAuditLog(db, {
    organizationId: original.organizationId,
    actorAuthUserId: input.actorAuthUserId,
    actionCode: "billing.credit.reverse",
    entityType: "credit_transaction",
    entityId: result.transaction.id,
    after: { reverses: original.id, reason },
  });

  return result;
}

export function serializeCreditTransaction(row: {
  id: string;
  amount: Money;
  currency: string;
  balanceBefore: Money;
  balanceAfter: Money;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  effectiveAt: Date;
  createdAt: Date;
  createdBy: string | null;
  transactionType: { code: string; nameTh: string };
  direction: { code: string };
}) {
  return {
    id: row.id,
    amount: serializeMoney(row.amount),
    currency: row.currency,
    balanceBefore: serializeMoney(row.balanceBefore),
    balanceAfter: serializeMoney(row.balanceAfter),
    reason: row.reason,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    effectiveAt: row.effectiveAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    transactionType: row.transactionType.code,
    transactionTypeLabelTh: row.transactionType.nameTh,
    direction: row.direction.code,
  };
}
