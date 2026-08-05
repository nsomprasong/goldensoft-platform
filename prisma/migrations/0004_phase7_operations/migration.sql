-- Phase 7 Complete Platform Operations (preview only).
-- Additive migration. Do NOT apply without explicit approval.
-- Extends organization roles for custom org-scoped roles, permission catalog,
-- role-permission assignments, product metadata, entitlements, and onboarding.

-- ─── Organization roles: allow org-scoped custom roles ─────────────────────
ALTER TABLE "platform"."organization_roles"
    ADD COLUMN IF NOT EXISTS "organization_id" UUID;

ALTER TABLE "platform"."organization_roles"
    ADD CONSTRAINT "organization_roles_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "platform"."organization_roles_code_key";

-- System roles remain globally unique when organization_id IS NULL.
CREATE UNIQUE INDEX "organization_roles_system_code_key"
    ON "platform"."organization_roles" ("code")
    WHERE "organization_id" IS NULL;

-- Custom roles are unique within an organization.
CREATE UNIQUE INDEX "organization_roles_org_code_key"
    ON "platform"."organization_roles" ("organization_id", "code")
    WHERE "organization_id" IS NOT NULL;

CREATE INDEX "organization_roles_organization_id_idx"
    ON "platform"."organization_roles" ("organization_id");

-- Code becomes immutable after first assignment (enforced in application).
ALTER TABLE "platform"."organization_roles"
    ADD COLUMN IF NOT EXISTS "code_locked" BOOLEAN NOT NULL DEFAULT false;

-- ─── Permission catalog ────────────────────────────────────────────────────
CREATE TABLE "platform"."permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description_th" TEXT,
    "description_en" TEXT,
    "product_code" TEXT NOT NULL DEFAULT 'PLATFORM',
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "permissions_code_key" UNIQUE ("code")
);

CREATE INDEX "permissions_product_resource_idx"
    ON "platform"."permissions" ("product_code", "resource");
CREATE INDEX "permissions_is_active_idx"
    ON "platform"."permissions" ("is_active");

CREATE TABLE "platform"."organization_role_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_role_permissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_role_permissions_role_permission_key"
        UNIQUE ("organization_role_id", "permission_id"),
    CONSTRAINT "organization_role_permissions_role_id_fkey"
        FOREIGN KEY ("organization_role_id") REFERENCES "platform"."organization_roles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "organization_role_permissions_permission_id_fkey"
        FOREIGN KEY ("permission_id") REFERENCES "platform"."permissions"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "organization_role_permissions_role_id_idx"
    ON "platform"."organization_role_permissions" ("organization_role_id");
CREATE INDEX "organization_role_permissions_permission_id_idx"
    ON "platform"."organization_role_permissions" ("permission_id");

-- ─── Product / plan metadata ───────────────────────────────────────────────
ALTER TABLE "platform"."products"
    ADD COLUMN IF NOT EXISTS "name_th" TEXT,
    ADD COLUMN IF NOT EXISTS "name_en" TEXT,
    ADD COLUMN IF NOT EXISTS "description" TEXT,
    ADD COLUMN IF NOT EXISTS "product_type" TEXT NOT NULL DEFAULT 'APPLICATION',
    ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

UPDATE "platform"."products"
SET "name_th" = COALESCE("name_th", "name"),
    "name_en" = COALESCE("name_en", "name")
WHERE "name_th" IS NULL OR "name_en" IS NULL;

ALTER TABLE "platform"."plans"
    ADD COLUMN IF NOT EXISTS "description" TEXT,
    ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

-- ─── Entitlement statuses + entitlements ───────────────────────────────────
CREATE TABLE "platform"."entitlement_statuses" (
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
    CONSTRAINT "entitlement_statuses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entitlement_statuses_code_key" UNIQUE ("code")
);

INSERT INTO "platform"."entitlement_statuses"
    ("id", "code", "name_th", "name_en", "sort_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'ACTIVE', 'ใช้งาน', 'Active', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'SUSPENDED', 'ระงับ', 'Suspended', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'EXPIRED', 'หมดอายุ', 'Expired', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'REVOKED', 'เพิกถอน', 'Revoked', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE "platform"."entitlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "limit_value" TEXT,
    "status_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "source_snapshot_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entitlements_org_subscription_code_key"
        UNIQUE ("organization_id", "subscription_id", "code"),
    CONSTRAINT "entitlements_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "entitlements_subscription_id_fkey"
        FOREIGN KEY ("subscription_id") REFERENCES "platform"."subscriptions"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "entitlements_product_id_fkey"
        FOREIGN KEY ("product_id") REFERENCES "platform"."products"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "entitlements_status_id_fkey"
        FOREIGN KEY ("status_id") REFERENCES "platform"."entitlement_statuses"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "entitlements_organization_id_status_id_idx"
    ON "platform"."entitlements" ("organization_id", "status_id");
CREATE INDEX "entitlements_subscription_id_idx"
    ON "platform"."entitlements" ("subscription_id");
CREATE INDEX "entitlements_product_id_idx"
    ON "platform"."entitlements" ("product_id");

-- ─── Organization onboarding state ─────────────────────────────────────────
CREATE TABLE "platform"."organization_onboarding_statuses" (
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
    CONSTRAINT "organization_onboarding_statuses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_onboarding_statuses_code_key" UNIQUE ("code")
);

INSERT INTO "platform"."organization_onboarding_statuses"
    ("id", "code", "name_th", "name_en", "sort_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'DRAFT', 'ร่าง', 'Draft', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'IN_PROGRESS', 'กำลังดำเนินการ', 'In progress', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'COMPLETED', 'เสร็จสิ้น', 'Completed', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'FAILED', 'ล้มเหลว', 'Failed', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE "platform"."organization_onboardings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "idempotency_key" TEXT NOT NULL,
    "organization_id" UUID,
    "status_id" UUID NOT NULL,
    "created_by_auth_user_id" UUID NOT NULL,
    "payload_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "result_json" JSONB,
    "last_error_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_onboardings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_onboardings_idempotency_key_key" UNIQUE ("idempotency_key"),
    CONSTRAINT "organization_onboardings_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "organization_onboardings_status_id_fkey"
        FOREIGN KEY ("status_id") REFERENCES "platform"."organization_onboarding_statuses"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "organization_onboardings_status_id_idx"
    ON "platform"."organization_onboardings" ("status_id");
CREATE INDEX "organization_onboardings_organization_id_idx"
    ON "platform"."organization_onboardings" ("organization_id");

-- ─── Audit action types for Phase 7 ────────────────────────────────────────
INSERT INTO "platform"."audit_action_types"
    ("id", "code", "name_th", "name_en", "sort_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'custom_role.create', 'สร้างบทบาทกำหนดเอง', 'Create custom role', 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'custom_role.update', 'แก้ไขบทบาทกำหนดเอง', 'Update custom role', 81, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'custom_role.deactivate', 'ปิดใช้งานบทบาทกำหนดเอง', 'Deactivate custom role', 82, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'custom_role.permission.add', 'เพิ่มสิทธิ์บทบาท', 'Add role permission', 83, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'custom_role.permission.remove', 'ลบสิทธิ์บทบาท', 'Remove role permission', 84, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'product.create', 'สร้างผลิตภัณฑ์', 'Create product', 85, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'product.update', 'แก้ไขผลิตภัณฑ์', 'Update product', 86, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'plan.create', 'สร้างแพ็กเกจ', 'Create plan', 87, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'plan.update', 'แก้ไขแพ็กเกจ', 'Update plan', 88, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'subscription.activate', 'เปิดใช้งานการสมัคร', 'Activate subscription', 89, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'subscription.trial', 'เริ่มทดลองใช้', 'Start trial subscription', 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'subscription.suspend', 'ระงับการสมัคร', 'Suspend subscription', 91, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'subscription.cancel', 'ยกเลิกการสมัคร', 'Cancel subscription', 92, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'subscription.change_plan', 'เปลี่ยนแพ็กเกจ', 'Change subscription plan', 93, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'entitlement.generate', 'สร้างสิทธิ์การใช้งาน', 'Generate entitlements', 94, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'organization.onboard', 'เริ่มใช้งานองค์กรใหม่', 'Onboard organization', 95, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'context.platform_admin', 'สลับโหมดผู้ดูแลแพลตฟอร์ม', 'Switch platform admin context', 96, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Seed baseline permission catalog (idempotent).
INSERT INTO "platform"."permissions"
    ("id", "code", "name_th", "name_en", "description_th", "product_code", "resource", "action", "sort_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'platform.organization.read', 'ดูข้อมูลองค์กร', 'Read organizations', 'ดูรายการและรายละเอียดองค์กร', 'PLATFORM', 'organization', 'read', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.organization.manage', 'จัดการองค์กร', 'Manage organizations', 'สร้าง แก้ไข และระงับองค์กร', 'PLATFORM', 'organization', 'manage', 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.branch.read', 'ดูข้อมูลสาขา', 'Read branches', 'ดูรายการและรายละเอียดสาขา', 'PLATFORM', 'branch', 'read', 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.branch.manage', 'จัดการสาขา', 'Manage branches', 'สร้าง แก้ไข และระงับสาขา', 'PLATFORM', 'branch', 'manage', 21, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.user.read', 'ดูผู้ใช้งาน', 'Read users', 'ดูสมาชิกและคำเชิญ', 'PLATFORM', 'user', 'read', 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.user.invite', 'เชิญผู้ใช้งาน', 'Invite users', 'ส่งคำเชิญเข้าองค์กร', 'PLATFORM', 'user', 'invite', 31, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.user.manage', 'จัดการผู้ใช้งาน', 'Manage users', 'แก้ไขสถานะและข้อมูลสมาชิก', 'PLATFORM', 'user', 'manage', 32, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.user.suspend', 'ระงับผู้ใช้งาน', 'Suspend users', 'ระงับการเข้าถึงของผู้ใช้', 'PLATFORM', 'user', 'suspend', 33, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.role.read', 'ดูบทบาทและสิทธิ์', 'Read roles', 'ดูบทบาทและเมทริกซ์สิทธิ์', 'PLATFORM', 'role', 'read', 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.role.manage', 'จัดการบทบาท', 'Manage roles', 'สร้างและแก้ไขบทบาทกำหนดเอง', 'PLATFORM', 'role', 'manage', 41, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.role.assign', 'กำหนดบทบาท', 'Assign roles', 'กำหนดหรือถอดบทบาทจากผู้ใช้', 'PLATFORM', 'role', 'assign', 42, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.audit.read', 'ดูบันทึกกิจกรรม', 'Read audit logs', 'ดูประวัติการเปลี่ยนแปลง', 'PLATFORM', 'audit', 'read', 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.product.read', 'ดูผลิตภัณฑ์', 'Read products', 'ดูรายการผลิตภัณฑ์', 'PLATFORM', 'product', 'read', 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.product.manage', 'จัดการผลิตภัณฑ์', 'Manage products', 'สร้างและแก้ไขผลิตภัณฑ์', 'PLATFORM', 'product', 'manage', 61, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.plan.read', 'ดูแพ็กเกจ', 'Read plans', 'ดูแพ็กเกจและเวอร์ชัน', 'PLATFORM', 'plan', 'read', 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.plan.manage', 'จัดการแพ็กเกจ', 'Manage plans', 'สร้างและแก้ไขแพ็กเกจ', 'PLATFORM', 'plan', 'manage', 71, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.subscription.read', 'ดูการสมัครใช้บริการ', 'Read subscriptions', 'ดูรายการการสมัคร', 'PLATFORM', 'subscription', 'read', 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.subscription.manage', 'จัดการการสมัครใช้บริการ', 'Manage subscriptions', 'สร้าง เปลี่ยนสถานะ และเปลี่ยนแพ็กเกจ', 'PLATFORM', 'subscription', 'manage', 81, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.settings.read', 'ดูการตั้งค่าระบบ', 'Read settings', 'ดูการตั้งค่าแพลตฟอร์ม', 'PLATFORM', 'settings', 'read', 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'platform.settings.manage', 'จัดการการตั้งค่าระบบ', 'Manage settings', 'แก้ไขค่าเริ่มต้นของแพลตฟอร์ม', 'PLATFORM', 'settings', 'manage', 91, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
