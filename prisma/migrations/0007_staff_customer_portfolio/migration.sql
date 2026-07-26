-- Phase: Staff Customer-Portfolio Management (Platform Admin) — preview only.
-- Additive migration. Do NOT apply without explicit approval.
-- Lets GoldenSoft staff (sales / account managers) be assigned specific
-- customer organizations, then manage that customer's users/roles/permissions
-- from Platform Admin. Staff are never added as organization_memberships.
-- Commission is out of scope for this phase.

-- ─── Staff ↔ customer organization portfolio assignments ──────────────────
CREATE TABLE "platform"."staff_organization_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "staff_user_profile_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "assigned_by_auth_user_id" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_organization_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_organization_assignments_staff_user_profile_id_fkey"
        FOREIGN KEY ("staff_user_profile_id") REFERENCES "platform"."user_profiles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staff_organization_assignments_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "staff_organization_assignments_staff_user_profile_id_idx"
    ON "platform"."staff_organization_assignments" ("staff_user_profile_id");

CREATE INDEX "staff_organization_assignments_organization_id_idx"
    ON "platform"."staff_organization_assignments" ("organization_id");

CREATE INDEX "staff_organization_assignments_staff_org_idx"
    ON "platform"."staff_organization_assignments" ("staff_user_profile_id", "organization_id");

-- Exactly one active (non-revoked) assignment per staff/organization pair.
CREATE UNIQUE INDEX "staff_organization_assignments_active_uidx"
    ON "platform"."staff_organization_assignments" ("staff_user_profile_id", "organization_id")
    WHERE "revoked_at" IS NULL;

-- ─── Platform roles: SALES / ACCOUNT_MANAGER ───────────────────────────────
INSERT INTO "platform"."platform_roles"
    ("id", "code", "name_th", "name_en", "sort_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'SALES', 'ฝ่ายขาย', 'Sales', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'ACCOUNT_MANAGER', 'ผู้ดูแลบัญชีลูกค้า', 'Account Manager', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- ─── Permission: manage staff↔customer portfolio assignments ──────────────
INSERT INTO "platform"."permissions"
    ("id", "code", "name_th", "name_en", "description_th", "product_code", "resource", "action", "sort_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'platform.customer_portfolio.manage', 'จัดการพอร์ตโฟลิโอลูกค้า', 'Manage customer portfolio', 'กำหนดหรือถอดองค์กรลูกค้าให้พนักงาน', 'PLATFORM', 'customer_portfolio', 'manage', 400, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- ─── Audit action types for portfolio assignment/revocation ───────────────
INSERT INTO "platform"."audit_action_types"
    ("id", "code", "name_th", "name_en", "sort_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'staff_portfolio.assign', 'กำหนดองค์กรลูกค้าให้พนักงาน', 'Assign customer organization to staff', 400, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'staff_portfolio.revoke', 'ถอดองค์กรลูกค้าจากพนักงาน', 'Revoke customer organization from staff', 401, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
