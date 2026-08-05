-- Phase 5 Functional Admin: contact fields + primary branch flag.
-- Additive only. Touches platform schema exclusively.
-- DO NOT apply without explicit approval.

ALTER TABLE "platform"."organizations"
  ADD COLUMN IF NOT EXISTS "name_en" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "address" TEXT;

ALTER TABLE "platform"."branches"
  ADD COLUMN IF NOT EXISTS "name_en" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "is_primary" BOOLEAN NOT NULL DEFAULT false;

-- At most one primary branch per organization among non-deleted rows.
CREATE UNIQUE INDEX IF NOT EXISTS "branches_one_primary_per_org"
  ON "platform"."branches" ("organization_id")
  WHERE "is_primary" = true AND "deleted_at" IS NULL;
