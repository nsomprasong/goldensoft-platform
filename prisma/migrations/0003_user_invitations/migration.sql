-- Phase 5B preview only. Do not apply without approval.
CREATE TABLE "platform"."user_invitation_statuses" (
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
    CONSTRAINT "user_invitation_statuses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_invitation_statuses_code_key" UNIQUE ("code")
);

INSERT INTO "platform"."user_invitation_statuses"
    ("code", "name_th", "name_en", "sort_order")
VALUES
    ('PENDING', 'รอส่งคำเชิญ', 'Pending', 1),
    ('AUTH_SENT', 'ส่งคำเชิญแล้ว', 'Auth sent', 2),
    ('COMPLETED', 'เปิดใช้งานแล้ว', 'Completed', 3),
    ('FAILED', 'ส่งไม่สำเร็จ', 'Failed', 4),
    ('PLATFORM_SETUP_FAILED', 'จัดเตรียมสิทธิ์ไม่สำเร็จ', 'Platform setup failed', 5),
    ('CANCELLED', 'ยกเลิก', 'Cancelled', 6),
    ('EXPIRED', 'หมดอายุ', 'Expired', 7);

CREATE TABLE "platform"."user_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email_normalized" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "organization_role_id" UUID NOT NULL,
    "branch_scope_type_id" UUID NOT NULL,
    "branch_ids_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "status_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "invited_by_profile_id" UUID NOT NULL,
    "auth_user_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "auth_invite_sent_at" TIMESTAMPTZ(6),
    "platform_setup_completed_at" TIMESTAMPTZ(6),
    "processing_started_at" TIMESTAMPTZ(6),
    "last_attempt_at" TIMESTAMPTZ(6),
    "last_error_code" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_invitations_organization_id_idempotency_key_key"
        UNIQUE ("organization_id", "idempotency_key"),
    CONSTRAINT "user_invitations_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_invitations_organization_role_id_fkey"
        FOREIGN KEY ("organization_role_id") REFERENCES "platform"."organization_roles"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_invitations_branch_scope_type_id_fkey"
        FOREIGN KEY ("branch_scope_type_id") REFERENCES "platform"."branch_scope_types"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_invitations_status_id_fkey"
        FOREIGN KEY ("status_id") REFERENCES "platform"."user_invitation_statuses"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_invitations_invited_by_profile_id_fkey"
        FOREIGN KEY ("invited_by_profile_id") REFERENCES "platform"."user_profiles"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "user_invitations_organization_id_created_at_idx"
    ON "platform"."user_invitations" ("organization_id", "created_at");
CREATE INDEX "user_invitations_email_normalized_organization_id_idx"
    ON "platform"."user_invitations" ("email_normalized", "organization_id");
CREATE INDEX "user_invitations_status_id_updated_at_idx"
    ON "platform"."user_invitations" ("status_id", "updated_at");
CREATE INDEX "user_invitations_auth_user_id_idx"
    ON "platform"."user_invitations" ("auth_user_id");
CREATE UNIQUE INDEX "user_invitations_active_email_org_key"
    ON "platform"."user_invitations" ("email_normalized", "organization_id")
    WHERE "is_active" = true;

INSERT INTO "platform"."audit_action_types"
    (
        "id",
        "code",
        "name_th",
        "name_en",
        "sort_order",
        "created_at",
        "updated_at"
    )
VALUES
    (
        gen_random_uuid(),
        'user.invite.requested',
        'ร้องขอส่งคำเชิญ',
        'User invite requested',
        19,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'user.invite.sent',
        'ส่งคำเชิญแล้ว',
        'User invite sent',
        20,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'user.invite.failed',
        'ส่งคำเชิญไม่สำเร็จ',
        'User invite failed',
        21,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'user.reinvite.requested',
        'ร้องขอส่งคำเชิญอีกครั้ง',
        'User reinvite requested',
        22,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'user.reinvite.sent',
        'ส่งคำเชิญอีกครั้งแล้ว',
        'User reinvite sent',
        23,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'user.reinvite.failed',
        'ส่งคำเชิญอีกครั้งไม่สำเร็จ',
        'User reinvite failed',
        24,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'user.invite.accepted',
        'ยอมรับคำเชิญ',
        'User invite accepted',
        25,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'user.platform_setup.completed',
        'จัดเตรียมสิทธิ์สำเร็จ',
        'User platform setup completed',
        26,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        gen_random_uuid(),
        'user.platform_setup.failed',
        'จัดเตรียมสิทธิ์ไม่สำเร็จ',
        'User platform setup failed',
        27,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
ON CONFLICT ("code") DO NOTHING;
