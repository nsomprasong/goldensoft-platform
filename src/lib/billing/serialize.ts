import { serializeMoney } from "@/lib/billing/money";

type Moneyish = { toFixed: (digits: number) => string } | null | undefined;

function money(value: Moneyish) {
  return serializeMoney(value as never);
}

export function serializeInvoice(
  invoice: {
    id: string;
    invoiceNumber: string;
    currency: string;
    issueDate: Date | null;
    dueDate: Date | null;
    paidAt: Date | null;
    notes: string | null;
    subtotal: Moneyish;
    discountTotal: Moneyish;
    taxTotal: Moneyish;
    grandTotal: Moneyish;
    paidTotal: Moneyish;
    outstandingTotal: Moneyish;
    createdAt: Date;
    status: { code: string; nameTh?: string | null };
    items: Array<{
      id: string;
      description: string;
      itemType: string;
      quantity: Moneyish;
      unitPrice: Moneyish;
      discountAmount: Moneyish;
      taxAmount: Moneyish;
      lineTotal: Moneyish;
      sortOrder: number;
      productId?: string | null;
      planId?: string | null;
      subscriptionId?: string | null;
    }>;
    allocations?: Array<{
      id: string;
      amount: Moneyish;
      createdAt: Date;
      payment?: {
        id: string;
        paymentNumber: string;
        status: { code: string };
        paymentMethod: { code: string; nameTh?: string | null };
      };
    }>;
  },
) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    status: invoice.status.code,
    statusLabelTh: invoice.status.nameTh ?? invoice.status.code,
    issueDate: invoice.issueDate?.toISOString() ?? null,
    dueDate: invoice.dueDate?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    notes: invoice.notes,
    subtotal: money(invoice.subtotal),
    discountTotal: money(invoice.discountTotal),
    taxTotal: money(invoice.taxTotal),
    grandTotal: money(invoice.grandTotal),
    paidTotal: money(invoice.paidTotal),
    outstandingTotal: money(invoice.outstandingTotal),
    createdAt: invoice.createdAt.toISOString(),
    items: invoice.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        id: item.id,
        description: item.description,
        itemType: item.itemType,
        quantity: money(item.quantity),
        unitPrice: money(item.unitPrice),
        discountAmount: money(item.discountAmount),
        taxAmount: money(item.taxAmount),
        lineTotal: money(item.lineTotal),
        productId: item.productId ?? null,
        planId: item.planId ?? null,
        subscriptionId: item.subscriptionId ?? null,
      })),
    allocations: (invoice.allocations ?? []).map((row) => ({
      id: row.id,
      amount: money(row.amount),
      createdAt: row.createdAt.toISOString(),
      paymentId: row.payment?.id ?? null,
      paymentNumber: row.payment?.paymentNumber ?? null,
      paymentStatus: row.payment?.status.code ?? null,
      paymentMethod: row.payment?.paymentMethod.code ?? null,
    })),
  };
}

export function serializePayment(
  payment: {
    id: string;
    paymentNumber: string;
    amount: Moneyish;
    currency: string;
    paidAt: Date;
    referenceNumber: string | null;
    evidenceUrl: string | null;
    notes: string | null;
    recordedBy: string | null;
    confirmedBy: string | null;
    confirmedAt: Date | null;
    createdAt: Date;
    status: { code: string; nameTh?: string | null };
    paymentMethod: { code: string; nameTh?: string | null };
    allocations?: Array<{
      id: string;
      amount: Moneyish;
      createdAt: Date;
      invoice?: {
        id: string;
        invoiceNumber: string;
        status: { code: string };
        outstandingTotal?: Moneyish;
      };
    }>;
  },
) {
  return {
    id: payment.id,
    paymentNumber: payment.paymentNumber,
    amount: money(payment.amount),
    currency: payment.currency,
    status: payment.status.code,
    statusLabelTh: payment.status.nameTh ?? payment.status.code,
    method: payment.paymentMethod.code,
    methodLabelTh: payment.paymentMethod.nameTh ?? payment.paymentMethod.code,
    paidAt: payment.paidAt.toISOString(),
    referenceNumber: payment.referenceNumber,
    evidenceUrl: payment.evidenceUrl,
    notes: payment.notes,
    recordedBy: payment.recordedBy,
    confirmedBy: payment.confirmedBy,
    confirmedAt: payment.confirmedAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
    creditTransactionId: null as string | null,
    allocations: (payment.allocations ?? []).map((row) => ({
      id: row.id,
      amount: money(row.amount),
      createdAt: row.createdAt.toISOString(),
      invoiceId: row.invoice?.id ?? null,
      invoiceNumber: row.invoice?.invoiceNumber ?? null,
      invoiceStatus: row.invoice?.status.code ?? null,
    })),
  };
}
