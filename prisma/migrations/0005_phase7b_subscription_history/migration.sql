-- Phase 7B subscription lifecycle history (preview only).
-- Additive migration. Do NOT apply without explicit approval.
-- Stores immutable lifecycle events for subscriptions (activate, suspend,
-- change plan, etc.). Until applied, UI reads history from audit_logs.

CREATE TABLE "platform"."subscription_change_types" (
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
    CONSTRAINT "subscription_change_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_change_types_code_key" UNIQUE ("code")
);

INSERT INTO "platform"."subscription_change_types"
    ("id", "code", "name_th", "name_en", "sort_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'CREATE', 'สร้าง', 'Create', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'ACTIVATE', 'เปิดใช้งาน', 'Activate', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'TRIAL', 'เริ่มทดลองใช้', 'Start trial', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'SUSPEND', 'ระงับ', 'Suspend', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'RESUME', 'กลับมาใช้งาน', 'Resume', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CANCEL', 'ยกเลิก', 'Cancel', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'EXPIRE', 'หมดอายุ', 'Expire', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CHANGE_PLAN', 'เปลี่ยนแพ็กเกจ', 'Change plan', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'EXTEND', 'ขยายวันสิ้นสุด', 'Extend end date', 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE "platform"."subscription_histories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "change_type_id" UUID NOT NULL,
    "from_status_code" TEXT,
    "to_status_code" TEXT,
    "from_plan_code" TEXT,
    "to_plan_code" TEXT,
    "from_plan_version_number" INTEGER,
    "to_plan_version_number" INTEGER,
    "snapshot_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "reason" TEXT,
    "actor_auth_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subscription_histories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_histories_subscription_id_fkey"
        FOREIGN KEY ("subscription_id") REFERENCES "platform"."subscriptions"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "subscription_histories_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "subscription_histories_change_type_id_fkey"
        FOREIGN KEY ("change_type_id") REFERENCES "platform"."subscription_change_types"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "subscription_histories_subscription_id_created_at_idx"
    ON "platform"."subscription_histories" ("subscription_id", "created_at" DESC);
CREATE INDEX "subscription_histories_organization_id_created_at_idx"
    ON "platform"."subscription_histories" ("organization_id", "created_at" DESC);

INSERT INTO "platform"."audit_action_types"
    ("id", "code", "name_th", "name_en", "sort_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'subscription.resume', 'กลับมาใช้งานการสมัคร', 'Resume subscription', 97, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'subscription.expire', 'หมดอายุการสมัคร', 'Expire subscription', 98, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'subscription.extend', 'ขยายวันสิ้นสุดการสมัคร', 'Extend subscription', 99, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'product.activate', 'เปิดใช้งานผลิตภัณฑ์', 'Activate product', 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'product.deactivate', 'ปิดใช้งานผลิตภัณฑ์', 'Deactivate product', 101, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'plan.activate', 'เปิดใช้งานแพ็กเกจ', 'Activate plan', 102, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'plan.deactivate', 'ปิดใช้งานแพ็กเกจ', 'Deactivate plan', 103, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'membership.activate', 'เปิดใช้งานสมาชิกภาพ', 'Activate membership', 104, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'membership.suspend', 'ระงับสมาชิกภาพ', 'Suspend membership', 105, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'entitlement.regenerate', 'สร้างสิทธิ์การใช้งานใหม่', 'Regenerate entitlements', 106, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
