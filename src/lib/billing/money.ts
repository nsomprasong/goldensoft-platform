import { Prisma } from "@prisma/client";

export type Money = Prisma.Decimal;

export class MoneyError extends Error {
  readonly code: string;
  constructor(code: string, messageTh: string) {
    super(messageTh);
    this.code = code;
    this.name = "MoneyError";
  }
}

export function money(value: string | number | Prisma.Decimal): Money {
  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new MoneyError("INVALID_AMOUNT", "จำนวนเงินไม่ถูกต้อง");
  }
}

/** Parse a positive amount (must be > 0). Rejects negatives and zero. */
export function parsePositiveAmount(value: unknown): Money {
  if (value === null || value === undefined || value === "") {
    throw new MoneyError("INVALID_AMOUNT", "กรุณาระบุจำนวนเงิน");
  }
  const amount = money(value as string | number);
  if (!amount.isFinite()) {
    throw new MoneyError("INVALID_AMOUNT", "จำนวนเงินไม่ถูกต้อง");
  }
  if (amount.lte(0)) {
    throw new MoneyError("NON_POSITIVE_AMOUNT", "จำนวนเงินต้องมากกว่าศูนย์");
  }
  if (amount.decimalPlaces() > 2) {
    throw new MoneyError(
      "TOO_MANY_DECIMALS",
      "จำนวนเงินต้องมีทศนิยมไม่เกิน 2 ตำแหน่ง",
    );
  }
  return amount.toDecimalPlaces(2);
}

export function parseNonNegativeAmount(value: unknown): Money {
  if (value === null || value === undefined || value === "") {
    return money(0);
  }
  const amount = money(value as string | number);
  if (!amount.isFinite() || amount.lt(0)) {
    throw new MoneyError("INVALID_AMOUNT", "จำนวนเงินต้องไม่ติดลบ");
  }
  return amount.toDecimalPlaces(2);
}

export function serializeMoney(value: Money | null | undefined): string | null {
  if (value == null) return null;
  return value.toFixed(2);
}

export function applyDirection(
  balance: Money,
  amount: Money,
  direction: "CREDIT" | "DEBIT",
): Money {
  return direction === "CREDIT" ? balance.plus(amount) : balance.minus(amount);
}

/** Pure ledger fold for tests and reconcile helpers. */
export function foldLedgerBalance(
  rows: Array<{ amount: Money; direction: "CREDIT" | "DEBIT" }>,
  starting: Money = money(0),
): Money {
  return rows.reduce(
    (balance, row) => applyDirection(balance, row.amount, row.direction),
    starting,
  );
}
