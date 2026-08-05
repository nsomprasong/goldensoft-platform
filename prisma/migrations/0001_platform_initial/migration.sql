-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateTable
CREATE TABLE "platform"."user_profile_statuses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_profile_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."platform_roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "platform_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."assignment_statuses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignment_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."organization_statuses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."branch_statuses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."membership_statuses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "membership_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."organization_roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."branch_scope_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branch_scope_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."product_statuses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."feature_statuses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."plan_statuses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plan_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."plan_version_statuses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plan_version_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."billing_cycles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "billing_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."subscription_statuses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."subscription_override_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_override_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."product_membership_statuses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_membership_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."outbox_event_statuses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outbox_event_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."idempotency_statuses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."legacy_migration_statuses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "legacy_migration_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."feature_value_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_value_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."audit_action_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "audit_action_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."user_profiles" (
    "id" UUID NOT NULL,
    "auth_user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status_id" UUID NOT NULL,
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."user_preferences" (
    "id" UUID NOT NULL,
    "user_profile_id" UUID NOT NULL,
    "last_organization_id" UUID,
    "last_branch_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."platform_role_assignments" (
    "id" UUID NOT NULL,
    "user_profile_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_auth_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "platform_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."organizations" (
    "id" UUID NOT NULL,
    "customer_code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status_id" UUID NOT NULL,
    "tax_id" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."branches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status_id" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "attendance_radius_meters" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."organization_memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_profile_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6),
    "invited_by_auth_user_id" UUID,
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."organization_membership_roles" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "organization_membership_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."organization_membership_branch_scopes" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "scope_type_id" UUID NOT NULL,
    "branch_id" UUID,
    "status_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_membership_branch_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."products" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."features" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."plans" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."plan_versions" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status_id" UUID NOT NULL,
    "billing_cycle_default_id" UUID NOT NULL,
    "price_amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "trial_days" INTEGER,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."plan_version_features" (
    "id" UUID NOT NULL,
    "plan_version_id" UUID NOT NULL,
    "feature_id" UUID NOT NULL,
    "limit_value" TEXT,
    "value_type_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_version_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_version_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "billing_cycle_id" UUID NOT NULL,
    "plan_code" TEXT NOT NULL,
    "plan_version_number" INTEGER NOT NULL,
    "price_amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "trial_ends_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "external_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."subscription_feature_overrides" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "feature_id" UUID NOT NULL,
    "override_type_id" UUID NOT NULL,
    "limit_value" TEXT,
    "reason" TEXT NOT NULL,
    "approved_by" TEXT NOT NULL,
    "status_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_feature_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."organization_product_memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "user_profile_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "organization_product_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "actor_auth_user_id" UUID,
    "action_type_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "organization_id" UUID,
    "status_id" UUID NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."idempotency_keys" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_json" JSONB,
    "status_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."legacy_identity_mappings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "legacy_auth_user_id" TEXT NOT NULL,
    "central_auth_user_id" UUID NOT NULL,
    "legacy_employee_id" TEXT NOT NULL,
    "new_employee_id" TEXT,
    "migration_status_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "legacy_identity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profile_statuses_code_key" ON "platform"."user_profile_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "platform_roles_code_key" ON "platform"."platform_roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_statuses_code_key" ON "platform"."assignment_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "organization_statuses_code_key" ON "platform"."organization_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "branch_statuses_code_key" ON "platform"."branch_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "membership_statuses_code_key" ON "platform"."membership_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "organization_roles_code_key" ON "platform"."organization_roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "branch_scope_types_code_key" ON "platform"."branch_scope_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_statuses_code_key" ON "platform"."product_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "feature_statuses_code_key" ON "platform"."feature_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plan_statuses_code_key" ON "platform"."plan_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plan_version_statuses_code_key" ON "platform"."plan_version_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "billing_cycles_code_key" ON "platform"."billing_cycles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_statuses_code_key" ON "platform"."subscription_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_override_types_code_key" ON "platform"."subscription_override_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_membership_statuses_code_key" ON "platform"."product_membership_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_event_statuses_code_key" ON "platform"."outbox_event_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_statuses_code_key" ON "platform"."idempotency_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_migration_statuses_code_key" ON "platform"."legacy_migration_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "feature_value_types_code_key" ON "platform"."feature_value_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "audit_action_types_code_key" ON "platform"."audit_action_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_auth_user_id_key" ON "platform"."user_profiles"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_email_key" ON "platform"."user_profiles"("email");

-- CreateIndex
CREATE INDEX "user_profiles_status_id_idx" ON "platform"."user_profiles"("status_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_profile_id_key" ON "platform"."user_preferences"("user_profile_id");

-- CreateIndex
CREATE INDEX "platform_role_assignments_user_profile_id_status_id_idx" ON "platform"."platform_role_assignments"("user_profile_id", "status_id");

-- CreateIndex
CREATE INDEX "platform_role_assignments_role_id_idx" ON "platform"."platform_role_assignments"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_customer_code_key" ON "platform"."organizations"("customer_code");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "platform"."organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_status_id_idx" ON "platform"."organizations"("status_id");

-- CreateIndex
CREATE INDEX "branches_organization_id_status_id_idx" ON "platform"."branches"("organization_id", "status_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_organization_id_code_key" ON "platform"."branches"("organization_id", "code");

-- CreateIndex
CREATE INDEX "organization_memberships_user_profile_id_status_id_idx" ON "platform"."organization_memberships"("user_profile_id", "status_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_user_profile_id_key" ON "platform"."organization_memberships"("organization_id", "user_profile_id");

-- CreateIndex
CREATE INDEX "organization_membership_roles_membership_id_status_id_idx" ON "platform"."organization_membership_roles"("membership_id", "status_id");

-- CreateIndex
CREATE INDEX "organization_membership_roles_role_id_idx" ON "platform"."organization_membership_roles"("role_id");

-- CreateIndex
CREATE INDEX "organization_membership_branch_scopes_membership_id_status__idx" ON "platform"."organization_membership_branch_scopes"("membership_id", "status_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "platform"."products"("code");

-- CreateIndex
CREATE INDEX "products_status_id_idx" ON "platform"."products"("status_id");

-- CreateIndex
CREATE UNIQUE INDEX "features_code_key" ON "platform"."features"("code");

-- CreateIndex
CREATE INDEX "features_product_id_idx" ON "platform"."features"("product_id");

-- CreateIndex
CREATE INDEX "features_status_id_idx" ON "platform"."features"("status_id");

-- CreateIndex
CREATE INDEX "plans_status_id_idx" ON "platform"."plans"("status_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_product_id_code_key" ON "platform"."plans"("product_id", "code");

-- CreateIndex
CREATE INDEX "plan_versions_status_id_idx" ON "platform"."plan_versions"("status_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_versions_plan_id_version_number_key" ON "platform"."plan_versions"("plan_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "plan_version_features_plan_version_id_feature_id_key" ON "platform"."plan_version_features"("plan_version_id", "feature_id");

-- CreateIndex
CREATE INDEX "subscriptions_organization_id_product_id_status_id_idx" ON "platform"."subscriptions"("organization_id", "product_id", "status_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_id_ends_at_idx" ON "platform"."subscriptions"("status_id", "ends_at");

-- CreateIndex
CREATE INDEX "subscription_feature_overrides_subscription_id_status_id_idx" ON "platform"."subscription_feature_overrides"("subscription_id", "status_id");

-- CreateIndex
CREATE INDEX "organization_product_memberships_status_id_idx" ON "platform"."organization_product_memberships"("status_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_product_memberships_organization_id_user_profi_key" ON "platform"."organization_product_memberships"("organization_id", "user_profile_id", "product_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "platform"."audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "platform"."audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_auth_user_id_idx" ON "platform"."audit_logs"("actor_auth_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_type_id_idx" ON "platform"."audit_logs"("action_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_idempotency_key_key" ON "platform"."outbox_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "outbox_events_status_id_available_at_idx" ON "platform"."outbox_events"("status_id", "available_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_status_id_idx" ON "platform"."idempotency_keys"("status_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "platform"."idempotency_keys"("scope", "key");

-- CreateIndex
CREATE INDEX "legacy_identity_mappings_migration_status_id_idx" ON "platform"."legacy_identity_mappings"("migration_status_id");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_identity_mappings_organization_id_legacy_auth_user_i_key" ON "platform"."legacy_identity_mappings"("organization_id", "legacy_auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_identity_mappings_organization_id_legacy_employee_id_key" ON "platform"."legacy_identity_mappings"("organization_id", "legacy_employee_id");

-- AddForeignKey
ALTER TABLE "platform"."user_profiles" ADD CONSTRAINT "user_profiles_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."user_profile_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."user_preferences" ADD CONSTRAINT "user_preferences_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "platform"."user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "platform"."user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "platform"."platform_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."platform_role_assignments" ADD CONSTRAINT "platform_role_assignments_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."assignment_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organizations" ADD CONSTRAINT "organizations_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."organization_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."branches" ADD CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."branches" ADD CONSTRAINT "branches_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."branch_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_memberships" ADD CONSTRAINT "organization_memberships_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "platform"."user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_memberships" ADD CONSTRAINT "organization_memberships_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."membership_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_membership_roles" ADD CONSTRAINT "organization_membership_roles_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "platform"."organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_membership_roles" ADD CONSTRAINT "organization_membership_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "platform"."organization_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_membership_roles" ADD CONSTRAINT "organization_membership_roles_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."assignment_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_membership_branch_scopes" ADD CONSTRAINT "organization_membership_branch_scopes_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "platform"."organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_membership_branch_scopes" ADD CONSTRAINT "organization_membership_branch_scopes_scope_type_id_fkey" FOREIGN KEY ("scope_type_id") REFERENCES "platform"."branch_scope_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_membership_branch_scopes" ADD CONSTRAINT "organization_membership_branch_scopes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "platform"."branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_membership_branch_scopes" ADD CONSTRAINT "organization_membership_branch_scopes_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."assignment_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."products" ADD CONSTRAINT "products_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."product_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."features" ADD CONSTRAINT "features_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "platform"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."features" ADD CONSTRAINT "features_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."feature_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."plans" ADD CONSTRAINT "plans_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "platform"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."plans" ADD CONSTRAINT "plans_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."plan_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."plan_versions" ADD CONSTRAINT "plan_versions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "platform"."plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."plan_versions" ADD CONSTRAINT "plan_versions_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."plan_version_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."plan_versions" ADD CONSTRAINT "plan_versions_billing_cycle_default_id_fkey" FOREIGN KEY ("billing_cycle_default_id") REFERENCES "platform"."billing_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."plan_version_features" ADD CONSTRAINT "plan_version_features_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "platform"."plan_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."plan_version_features" ADD CONSTRAINT "plan_version_features_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "platform"."features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."plan_version_features" ADD CONSTRAINT "plan_version_features_value_type_id_fkey" FOREIGN KEY ("value_type_id") REFERENCES "platform"."feature_value_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."subscriptions" ADD CONSTRAINT "subscriptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "platform"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "platform"."plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."subscriptions" ADD CONSTRAINT "subscriptions_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "platform"."plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."subscriptions" ADD CONSTRAINT "subscriptions_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."subscription_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."subscriptions" ADD CONSTRAINT "subscriptions_billing_cycle_id_fkey" FOREIGN KEY ("billing_cycle_id") REFERENCES "platform"."billing_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."subscription_feature_overrides" ADD CONSTRAINT "subscription_feature_overrides_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "platform"."subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."subscription_feature_overrides" ADD CONSTRAINT "subscription_feature_overrides_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "platform"."features"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."subscription_feature_overrides" ADD CONSTRAINT "subscription_feature_overrides_override_type_id_fkey" FOREIGN KEY ("override_type_id") REFERENCES "platform"."subscription_override_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."subscription_feature_overrides" ADD CONSTRAINT "subscription_feature_overrides_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."assignment_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_product_memberships" ADD CONSTRAINT "organization_product_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_product_memberships" ADD CONSTRAINT "organization_product_memberships_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "platform"."organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_product_memberships" ADD CONSTRAINT "organization_product_memberships_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "platform"."user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_product_memberships" ADD CONSTRAINT "organization_product_memberships_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "platform"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."organization_product_memberships" ADD CONSTRAINT "organization_product_memberships_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."product_membership_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."audit_logs" ADD CONSTRAINT "audit_logs_action_type_id_fkey" FOREIGN KEY ("action_type_id") REFERENCES "platform"."audit_action_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."outbox_events" ADD CONSTRAINT "outbox_events_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."outbox_event_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."idempotency_keys" ADD CONSTRAINT "idempotency_keys_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "platform"."idempotency_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."legacy_identity_mappings" ADD CONSTRAINT "legacy_identity_mappings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."legacy_identity_mappings" ADD CONSTRAINT "legacy_identity_mappings_migration_status_id_fkey" FOREIGN KEY ("migration_status_id") REFERENCES "platform"."legacy_migration_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
