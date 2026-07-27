-- Platform role ↔ permission grants (editable by SUPER_ADMIN).

CREATE TABLE "platform"."platform_role_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platform_role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_role_permissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_role_permissions_platform_role_id_fkey"
        FOREIGN KEY ("platform_role_id") REFERENCES "platform"."platform_roles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "platform_role_permissions_permission_id_fkey"
        FOREIGN KEY ("permission_id") REFERENCES "platform"."permissions"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "platform_role_permissions_platform_role_id_permission_id_key"
        UNIQUE ("platform_role_id", "permission_id")
);

CREATE INDEX "platform_role_permissions_platform_role_id_idx"
    ON "platform"."platform_role_permissions" ("platform_role_id");

CREATE INDEX "platform_role_permissions_permission_id_idx"
    ON "platform"."platform_role_permissions" ("permission_id");
