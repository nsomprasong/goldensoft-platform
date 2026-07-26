import { z } from "zod";

import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";

const moneyLike = z.union([z.string(), z.number()]);

const invoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: moneyLike.optional(),
  unitPrice: moneyLike,
  discountAmount: moneyLike.optional(),
  taxAmount: moneyLike.optional(),
  itemType: z.string().optional(),
});

const contactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
});

export const BILLING_ACTIONS = [
  "createAccount",
  "adjustCredit",
  "createInvoice",
  "updateInvoice",
  "issueInvoice",
  "voidInvoice",
  "recordPayment",
  "confirmPayment",
  "allocatePayment",
  "createContact",
  "updateContact",
  "deactivateContact",
  "setPrimaryContact",
] as const;

export type BillingAction = (typeof BILLING_ACTIONS)[number];

export const billingActionPermission: Record<BillingAction, string> = {
  createAccount: PLATFORM_PERMISSIONS.billingAccountManage,
  adjustCredit: PLATFORM_PERMISSIONS.billingCreditAdjust,
  createInvoice: PLATFORM_PERMISSIONS.billingInvoiceManage,
  updateInvoice: PLATFORM_PERMISSIONS.billingInvoiceManage,
  issueInvoice: PLATFORM_PERMISSIONS.billingInvoiceManage,
  voidInvoice: PLATFORM_PERMISSIONS.billingInvoiceManage,
  recordPayment: PLATFORM_PERMISSIONS.billingPaymentRecord,
  confirmPayment: PLATFORM_PERMISSIONS.billingPaymentRecord,
  allocatePayment: PLATFORM_PERMISSIONS.billingPaymentRecord,
  createContact: PLATFORM_PERMISSIONS.billingContactManage,
  updateContact: PLATFORM_PERMISSIONS.billingContactManage,
  deactivateContact: PLATFORM_PERMISSIONS.billingContactManage,
  setPrimaryContact: PLATFORM_PERMISSIONS.billingContactManage,
};

const base = z.object({
  organizationId: z.string().uuid(),
});

export const billingActionSchemas = {
  createAccount: base.extend({
    action: z.literal("createAccount"),
    creditLimit: moneyLike.optional(),
  }),
  adjustCredit: base.extend({
    action: z.literal("adjustCredit"),
    direction: z.enum(["CREDIT", "DEBIT"]),
    amount: moneyLike,
    reason: z.string().min(1),
    idempotencyKey: z.string().min(1).optional(),
  }),
  createInvoice: base.extend({
    action: z.literal("createInvoice"),
    invoiceNumber: z.string().optional(),
    dueDate: z.string().optional(),
    notes: z.string().nullable().optional(),
    items: z.array(invoiceItemSchema).min(1),
  }),
  updateInvoice: base.extend({
    action: z.literal("updateInvoice"),
    invoiceId: z.string().uuid(),
    dueDate: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    items: z.array(invoiceItemSchema).min(1),
  }),
  issueInvoice: base.extend({
    action: z.literal("issueInvoice"),
    invoiceId: z.string().uuid(),
  }),
  voidInvoice: base.extend({
    action: z.literal("voidInvoice"),
    invoiceId: z.string().uuid(),
    reason: z.string().min(1),
  }),
  recordPayment: base.extend({
    action: z.literal("recordPayment"),
    paymentNumber: z.string().min(1),
    amount: moneyLike,
    methodCode: z.string().min(1),
    referenceNumber: z.string().nullable().optional(),
  }),
  confirmPayment: base.extend({
    action: z.literal("confirmPayment"),
    paymentId: z.string().uuid(),
  }),
  allocatePayment: base.extend({
    action: z.literal("allocatePayment"),
    paymentId: z.string().uuid(),
    invoiceId: z.string().uuid(),
    amount: moneyLike,
  }),
  createContact: base.extend({
    action: z.literal("createContact"),
    contact: contactSchema,
  }),
  updateContact: base.extend({
    action: z.literal("updateContact"),
    contactId: z.string().uuid(),
    contact: contactSchema,
  }),
  deactivateContact: base.extend({
    action: z.literal("deactivateContact"),
    contactId: z.string().uuid(),
  }),
  setPrimaryContact: base.extend({
    action: z.literal("setPrimaryContact"),
    contactId: z.string().uuid(),
  }),
} as const;

export function parseBillingAction(body: unknown): {
  action: BillingAction;
  data: z.infer<(typeof billingActionSchemas)[BillingAction]>;
} {
  if (!body || typeof body !== "object") {
    throw new Error("INVALID_BODY");
  }
  const action = String((body as { action?: unknown }).action ?? "");
  if (!(BILLING_ACTIONS as readonly string[]).includes(action)) {
    throw new Error("UNKNOWN_ACTION");
  }
  const schema = billingActionSchemas[action as BillingAction];
  const data = schema.parse(body);
  return { action: action as BillingAction, data };
}
