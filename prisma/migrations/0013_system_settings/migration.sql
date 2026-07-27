-- Runtime system settings (toggles) for Platform Admin.

CREATE TABLE "platform"."system_settings" (
    "key" TEXT NOT NULL,
    "value_json" JSONB NOT NULL,
    "updated_by_auth_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

INSERT INTO "platform"."system_settings" ("key", "value_json")
VALUES
  ('auth.invitations.send_enabled', 'true'::jsonb),
  ('auth.login.phone_enabled', 'false'::jsonb)
ON CONFLICT ("key") DO NOTHING;
