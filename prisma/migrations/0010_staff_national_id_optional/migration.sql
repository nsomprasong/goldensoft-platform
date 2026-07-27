-- Allow staff profiles without a national ID during early testing.
-- Unique constraint remains; PostgreSQL permits multiple NULLs.

ALTER TABLE "platform"."staff_profiles"
  ALTER COLUMN "national_id" DROP NOT NULL;
