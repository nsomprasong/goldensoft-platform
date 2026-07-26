export class BillingError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, messageTh: string, httpStatus = 400) {
    super(messageTh);
    this.code = code;
    this.httpStatus = httpStatus;
    this.name = "BillingError";
  }
}

export const BILLING_CODES = {
  accountStatus: {
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    CLOSED: "CLOSED",
  },
  direction: {
    CREDIT: "CREDIT",
    DEBIT: "DEBIT",
  },
  transactionType: {
    TOP_UP: "TOP_UP",
    DEBIT: "DEBIT",
    ADJUSTMENT_CREDIT: "ADJUSTMENT_CREDIT",
    ADJUSTMENT_DEBIT: "ADJUSTMENT_DEBIT",
    REFUND: "REFUND",
    EXPIRY: "EXPIRY",
    INVOICE_PAYMENT: "INVOICE_PAYMENT",
    SUBSCRIPTION_CHARGE: "SUBSCRIPTION_CHARGE",
    REVERSAL: "REVERSAL",
  },
  invoiceStatus: {
    DRAFT: "DRAFT",
    ISSUED: "ISSUED",
    PARTIALLY_PAID: "PARTIALLY_PAID",
    PAID: "PAID",
    OVERDUE: "OVERDUE",
    VOID: "VOID",
    CANCELLED: "CANCELLED",
  },
  paymentStatus: {
    PENDING: "PENDING",
    CONFIRMED: "CONFIRMED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    REFUNDED: "REFUNDED",
  },
  paymentMethod: {
    BANK_TRANSFER: "BANK_TRANSFER",
    CASH: "CASH",
    MANUAL_CREDIT: "MANUAL_CREDIT",
    PROMPTPAY: "PROMPTPAY",
    CARD: "CARD",
    OTHER: "OTHER",
  },
} as const;

/** Methods that must not be used for live gateway flows in Phase 8B.4. */
export const UNUSED_GATEWAY_METHODS = new Set([
  BILLING_CODES.paymentMethod.PROMPTPAY,
  BILLING_CODES.paymentMethod.CARD,
]);
