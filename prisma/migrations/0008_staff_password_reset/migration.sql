-- Phase: GoldenSoft staff administration + administrator-initiated password reset.
-- Additive migration (preview). Do NOT apply without explicit approval.
-- Adds an auditable reset window per user profile so an operator can reset a
-- password without knowing it: the user signs in once with an empty password,
-- lands on the set-password screen, then returns to /login.

-- ─── Administrator-initiated password resets ───────────────────────────────
CREATE TABLE "platform"."user_password_resets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_profile_id" UUID NOT NULL,
    "requested_by_auth_user_id" UUID,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_password_resets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_password_resets_user_profile_id_fkey"
        FOREIGN KEY ("user_profile_id") REFERENCES "platform"."user_profiles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "user_password_resets_user_profile_id_idx"
    ON "platform"."user_password_resets" ("user_profile_id");

CREATE INDEX "user_password_resets_expires_at_idx"
    ON "platform"."user_password_resets" ("expires_at");

-- At most one open reset per profile; history is preserved by consuming or
-- cancelling rows instead of deleting them.
CREATE UNIQUE INDEX "user_password_resets_open_uidx"
    ON "platform"."user_password_resets" ("user_profile_id")
    WHERE "consumed_at" IS NULL AND "cancelled_at" IS NULL;

-- ─── Permission: reset another user's password ─────────────────────────────
INSERT INTO "platform"."permissions"
    ("id", "code", "name_th", "name_en", "description_th", "product_code", "resource", "action", "sort_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'platform.user.password_reset', 'รีเซ็ตรหัสผ่านผู้ใช้', 'Reset user password', 'เปิดสิทธิ์ให้ผู้ใช้ตั้งรหัสผ่านใหม่ด้วยตนเอง โดยผู้ดูแลไม่ทราบรหัสผ่าน', 'PLATFORM', 'user', 'password_reset', 410, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- ─── Audit action types for staff administration + password resets ─────────
INSERT INTO "platform"."audit_action_types"
    ("id", "code", "name_th", "name_en", "sort_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'staff.create', 'เพิ่มพนักงาน GoldenSoft', 'Create GoldenSoft staff', 410, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'staff.update', 'แก้ไขข้อมูลพนักงาน GoldenSoft', 'Update GoldenSoft staff', 411, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'user.password_reset.request', 'เปิดคำขอรีเซ็ตรหัสผ่าน', 'Request password reset', 412, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'user.password_reset.complete', 'ตั้งรหัสผ่านใหม่สำเร็จ', 'Password reset completed', 413, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'user.password_reset.cancel', 'ยกเลิกคำขอรีเซ็ตรหัสผ่าน', 'Cancel password reset', 414, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
