-- Phase 8B.4 Billing & Credit Ledger Foundation (preview only).
-- Additive migration. Do NOT apply without explicit approval.
-- Append-only credit ledger; invoice/payment masters; no gateway.

-- ========== Masters ==========

CREATE TABLE "platform"."billing_account_statuses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_account_statuses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_account_statuses_code_key" UNIQUE ("code")
);

CREATE TABLE "platform"."credit_transaction_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_transaction_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_transaction_types_code_key" UNIQUE ("code")
);

CREATE TABLE "platform"."credit_directions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_directions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_directions_code_key" UNIQUE ("code")
);

CREATE TABLE "platform"."invoice_statuses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_statuses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_statuses_code_key" UNIQUE ("code")
);

CREATE TABLE "platform"."payment_statuses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_statuses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_statuses_code_key" UNIQUE ("code")
);

CREATE TABLE "platform"."payment_methods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_methods_code_key" UNIQUE ("code")
);

INSERT INTO "platform"."billing_account_statuses"
    ("id", "code", "name_th", "name_en", "sort_order")
VALUES
    (gen_random_uuid(), 'ACTIVE', 'ใช้งาน', 'Active', 1),
    (gen_random_uuid(), 'SUSPENDED', 'ระงับ', 'Suspended', 2),
    (gen_random_uuid(), 'CLOSED', 'ปิดบัญชี', 'Closed', 3)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "platform"."credit_transaction_types"
    ("id", "code", "name_th", "name_en", "sort_order")
VALUES
    (gen_random_uuid(), 'TOP_UP', 'เติมเครดิต', 'Top up', 1),
    (gen_random_uuid(), 'DEBIT', 'หักเครดิต', 'Debit', 2),
    (gen_random_uuid(), 'ADJUSTMENT_CREDIT', 'ปรับปรุงเพิ่ม', 'Adjustment credit', 3),
    (gen_random_uuid(), 'ADJUSTMENT_DEBIT', 'ปรับปรุงลด', 'Adjustment debit', 4),
    (gen_random_uuid(), 'REFUND', 'คืนเงิน', 'Refund', 5),
    (gen_random_uuid(), 'EXPIRY', 'หมดอายุ', 'Expiry', 6),
    (gen_random_uuid(), 'INVOICE_PAYMENT', 'ชำระใบแจ้งหนี้', 'Invoice payment', 7),
    (gen_random_uuid(), 'SUBSCRIPTION_CHARGE', 'คิดค่าบริการ', 'Subscription charge', 8),
    (gen_random_uuid(), 'REVERSAL', 'กลับรายการ', 'Reversal', 9)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "platform"."credit_directions"
    ("id", "code", "name_th", "name_en", "sort_order")
VALUES
    (gen_random_uuid(), 'CREDIT', 'เข้า', 'Credit', 1),
    (gen_random_uuid(), 'DEBIT', 'ออก', 'Debit', 2)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "platform"."invoice_statuses"
    ("id", "code", "name_th", "name_en", "sort_order")
VALUES
    (gen_random_uuid(), 'DRAFT', 'ร่าง', 'Draft', 1),
    (gen_random_uuid(), 'ISSUED', 'ออกแล้ว', 'Issued', 2),
    (gen_random_uuid(), 'PARTIALLY_PAID', 'ชำระบางส่วน', 'Partially paid', 3),
    (gen_random_uuid(), 'PAID', 'ชำระครบ', 'Paid', 4),
    (gen_random_uuid(), 'OVERDUE', 'เกินกำหนด', 'Overdue', 5),
    (gen_random_uuid(), 'VOID', 'โมฆะ', 'Void', 6),
    (gen_random_uuid(), 'CANCELLED', 'ยกเลิก', 'Cancelled', 7)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "platform"."payment_statuses"
    ("id", "code", "name_th", "name_en", "sort_order")
VALUES
    (gen_random_uuid(), 'PENDING', 'รอยืนยัน', 'Pending', 1),
    (gen_random_uuid(), 'CONFIRMED', 'ยืนยันแล้ว', 'Confirmed', 2),
    (gen_random_uuid(), 'FAILED', 'ไม่สำเร็จ', 'Failed', 3),
    (gen_random_uuid(), 'CANCELLED', 'ยกเลิก', 'Cancelled', 4),
    (gen_random_uuid(), 'REFUNDED', 'คืนเงินแล้ว', 'Refunded', 5)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "platform"."payment_methods"
    ("id", "code", "name_th", "name_en", "sort_order")
VALUES
    (gen_random_uuid(), 'BANK_TRANSFER', 'โอนเงิน', 'Bank transfer', 1),
    (gen_random_uuid(), 'CASH', 'เงินสด', 'Cash', 2),
    (gen_random_uuid(), 'MANUAL_CREDIT', 'เครดิต (บันทึกมือ)', 'Manual credit', 3),
    (gen_random_uuid(), 'PROMPTPAY', 'พร้อมเพย์ (ยังไม่เปิดใช้)', 'PromptPay (unused)', 4),
    (gen_random_uuid(), 'CARD', 'บัตรเครดิต (ยังไม่เปิดใช้)', 'Card (unused)', 5),
    (gen_random_uuid(), 'OTHER', 'อื่น ๆ', 'Other', 6)
ON CONFLICT ("code") DO NOTHING;

-- ========== Business tables ==========

CREATE TABLE "platform"."billing_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "status_id" UUID NOT NULL,
    "current_balance_snapshot" NUMERIC(18, 2),
    "credit_limit" NUMERIC(18, 2),
    "allow_negative_balance" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_accounts_organization_id_key" UNIQUE ("organization_id"),
    CONSTRAINT "billing_accounts_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "billing_accounts_status_id_fkey"
        FOREIGN KEY ("status_id") REFERENCES "platform"."billing_account_statuses"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "billing_accounts_status_id_idx"
    ON "platform"."billing_accounts" ("status_id");

CREATE TABLE "platform"."credit_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "billing_account_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "transaction_type_id" UUID NOT NULL,
    "direction_id" UUID NOT NULL,
    "amount" NUMERIC(18, 2) NOT NULL,
    "currency" TEXT NOT NULL,
    "balance_before" NUMERIC(18, 2) NOT NULL,
    "balance_after" NUMERIC(18, 2) NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "reason" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "effective_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT,
    "reverses_transaction_id" UUID,
    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_transactions_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "credit_transactions_billing_account_id_fkey"
        FOREIGN KEY ("billing_account_id") REFERENCES "platform"."billing_accounts"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "credit_transactions_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "credit_transactions_transaction_type_id_fkey"
        FOREIGN KEY ("transaction_type_id") REFERENCES "platform"."credit_transaction_types"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "credit_transactions_direction_id_fkey"
        FOREIGN KEY ("direction_id") REFERENCES "platform"."credit_directions"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "credit_transactions_reverses_transaction_id_fkey"
        FOREIGN KEY ("reverses_transaction_id") REFERENCES "platform"."credit_transactions"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "credit_transactions_account_idempotency_key_uidx"
    ON "platform"."credit_transactions" ("billing_account_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX "credit_transactions_account_created_at_idx"
    ON "platform"."credit_transactions" ("billing_account_id", "created_at" DESC);

CREATE INDEX "credit_transactions_organization_created_at_idx"
    ON "platform"."credit_transactions" ("organization_id", "created_at" DESC);

CREATE INDEX "credit_transactions_type_id_idx"
    ON "platform"."credit_transactions" ("transaction_type_id");

CREATE TABLE "platform"."invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "billing_account_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "subtotal" NUMERIC(18, 2) NOT NULL DEFAULT 0,
    "discount_total" NUMERIC(18, 2) NOT NULL DEFAULT 0,
    "tax_total" NUMERIC(18, 2) NOT NULL DEFAULT 0,
    "grand_total" NUMERIC(18, 2) NOT NULL DEFAULT 0,
    "paid_total" NUMERIC(18, 2) NOT NULL DEFAULT 0,
    "outstanding_total" NUMERIC(18, 2) NOT NULL DEFAULT 0,
    "status_id" UUID NOT NULL,
    "issue_date" DATE,
    "due_date" DATE,
    "paid_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number"),
    CONSTRAINT "invoices_totals_non_negative" CHECK (
        "subtotal" >= 0 AND "discount_total" >= 0 AND "tax_total" >= 0
        AND "grand_total" >= 0 AND "paid_total" >= 0 AND "outstanding_total" >= 0
    ),
    CONSTRAINT "invoices_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "invoices_billing_account_id_fkey"
        FOREIGN KEY ("billing_account_id") REFERENCES "platform"."billing_accounts"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoices_status_id_fkey"
        FOREIGN KEY ("status_id") REFERENCES "platform"."invoice_statuses"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "invoices_organization_created_at_idx"
    ON "platform"."invoices" ("organization_id", "created_at" DESC);

CREATE INDEX "invoices_status_due_date_idx"
    ON "platform"."invoices" ("status_id", "due_date");

CREATE TABLE "platform"."invoice_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "item_type" TEXT NOT NULL,
    "product_id" UUID,
    "plan_id" UUID,
    "subscription_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" NUMERIC(18, 4) NOT NULL DEFAULT 1,
    "unit_price" NUMERIC(18, 2) NOT NULL DEFAULT 0,
    "discount_amount" NUMERIC(18, 2) NOT NULL DEFAULT 0,
    "tax_amount" NUMERIC(18, 2) NOT NULL DEFAULT 0,
    "line_total" NUMERIC(18, 2) NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_items_invoice_id_fkey"
        FOREIGN KEY ("invoice_id") REFERENCES "platform"."invoices"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "invoice_items_invoice_id_idx"
    ON "platform"."invoice_items" ("invoice_id");

CREATE TABLE "platform"."payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "billing_account_id" UUID NOT NULL,
    "payment_number" TEXT NOT NULL,
    "payment_method_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "amount" NUMERIC(18, 2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "reference_number" TEXT,
    "evidence_url" TEXT,
    "notes" TEXT,
    "recorded_by" UUID,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_payment_number_key" UNIQUE ("payment_number"),
    CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "payments_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payments_billing_account_id_fkey"
        FOREIGN KEY ("billing_account_id") REFERENCES "platform"."billing_accounts"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payments_payment_method_id_fkey"
        FOREIGN KEY ("payment_method_id") REFERENCES "platform"."payment_methods"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payments_status_id_fkey"
        FOREIGN KEY ("status_id") REFERENCES "platform"."payment_statuses"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "payments_organization_created_at_idx"
    ON "platform"."payments" ("organization_id", "created_at" DESC);

CREATE INDEX "payments_status_id_idx"
    ON "platform"."payments" ("status_id");

CREATE TABLE "platform"."payment_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" NUMERIC(18, 2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_allocations_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "payment_allocations_payment_invoice_key" UNIQUE ("payment_id", "invoice_id"),
    CONSTRAINT "payment_allocations_payment_id_fkey"
        FOREIGN KEY ("payment_id") REFERENCES "platform"."payments"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payment_allocations_invoice_id_fkey"
        FOREIGN KEY ("invoice_id") REFERENCES "platform"."invoices"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "payment_allocations_invoice_id_idx"
    ON "platform"."payment_allocations" ("invoice_id");

CREATE TABLE "platform"."billing_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "title" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_contacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_contacts_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "billing_contacts_organization_id_idx"
    ON "platform"."billing_contacts" ("organization_id", "is_active");

CREATE UNIQUE INDEX "billing_contacts_one_primary_uidx"
    ON "platform"."billing_contacts" ("organization_id")
    WHERE "is_primary" = true AND "is_active" = true;

-- ========== Catalog seeds ==========

INSERT INTO "platform"."permissions"
    ("id", "code", "name_th", "name_en", "description_th", "product_code", "resource", "action", "sort_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'billing.account.read', 'ดูบัญชีการเงิน', 'Read billing account', 'ดูบัญชีการเงินขององค์กร', 'PLATFORM', 'account', 'read', 300, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.account.manage', 'จัดการบัญชีการเงิน', 'Manage billing account', 'สร้างและจัดการบัญชีการเงิน', 'PLATFORM', 'account', 'manage', 301, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.credit.read', 'ดูเครดิต', 'Read credit', 'ดูยอดและประวัติเครดิต', 'PLATFORM', 'credit', 'read', 302, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.credit.adjust', 'ปรับเครดิต', 'Adjust credit', 'บันทึกปรับปรุงเครดิต', 'PLATFORM', 'credit', 'adjust', 303, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.invoice.read', 'ดูใบแจ้งหนี้', 'Read invoices', 'ดูใบแจ้งหนี้', 'PLATFORM', 'invoice', 'read', 304, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.invoice.manage', 'จัดการใบแจ้งหนี้', 'Manage invoices', 'สร้าง ออก และโมฆะใบแจ้งหนี้', 'PLATFORM', 'invoice', 'manage', 305, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.payment.read', 'ดูการชำระเงิน', 'Read payments', 'ดูรายการชำระเงิน', 'PLATFORM', 'payment', 'read', 306, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.payment.record', 'บันทึกการชำระเงิน', 'Record payments', 'บันทึกและยืนยันการชำระเงินแบบมือ', 'PLATFORM', 'payment', 'record', 307, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.contact.read', 'ดูผู้ติดต่อการเงิน', 'Read billing contacts', 'ดูผู้ติดต่อการเงิน', 'PLATFORM', 'contact', 'read', 308, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.contact.manage', 'จัดการผู้ติดต่อการเงิน', 'Manage billing contacts', 'สร้างและแก้ไขผู้ติดต่อการเงิน', 'PLATFORM', 'contact', 'manage', 309, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.subscription.read', 'ดูสรุปแพ็กเกจ/การสมัคร', 'Read billing subscriptions', 'ดูสรุปแพ็กเกจและวันหมดอายุ', 'PLATFORM', 'subscription', 'read', 310, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.subscription.manage', 'จัดการแพ็กเกจด้านการเงิน', 'Manage billing subscriptions', 'จัดการมุมมองแพ็กเกจด้านการเงิน', 'PLATFORM', 'subscription', 'manage', 311, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "platform"."audit_action_types"
    ("id", "code", "name_th", "name_en", "sort_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'billing.account.create', 'สร้างบัญชีการเงิน', 'Create billing account', 200, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.credit.adjust', 'ปรับเครดิต', 'Adjust credit', 201, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.credit.reverse', 'กลับรายการเครดิต', 'Reverse credit transaction', 202, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.invoice.create', 'สร้างใบแจ้งหนี้', 'Create invoice', 203, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.invoice.update', 'แก้ไขใบแจ้งหนี้', 'Update invoice', 204, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.invoice.issue', 'ออกใบแจ้งหนี้', 'Issue invoice', 205, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.invoice.void', 'โมฆะใบแจ้งหนี้', 'Void invoice', 206, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.payment.record', 'บันทึกการชำระเงิน', 'Record payment', 207, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.payment.confirm', 'ยืนยันการชำระเงิน', 'Confirm payment', 208, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.payment.allocate', 'จัดสรรการชำระเงิน', 'Allocate payment', 209, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.contact.create', 'สร้างผู้ติดต่อการเงิน', 'Create billing contact', 210, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.contact.update', 'แก้ไขผู้ติดต่อการเงิน', 'Update billing contact', 211, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'billing.contact.deactivate', 'ปิดใช้งานผู้ติดต่อการเงิน', 'Deactivate billing contact', 212, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
