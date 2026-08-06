CREATE TABLE "platform"."organization_role_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "standard_role_id" UUID NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "permission_codes" TEXT[] NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_role_overrides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_role_overrides_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "platform"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "organization_role_overrides_standard_role_id_fkey"
      FOREIGN KEY ("standard_role_id") REFERENCES "platform"."organization_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_role_overrides_org_role_key"
  ON "platform"."organization_role_overrides" ("organization_id", "standard_role_id");
CREATE INDEX "organization_role_overrides_organization_id_idx"
  ON "platform"."organization_role_overrides" ("organization_id");
CREATE INDEX "organization_role_overrides_standard_role_id_idx"
  ON "platform"."organization_role_overrides" ("standard_role_id");
