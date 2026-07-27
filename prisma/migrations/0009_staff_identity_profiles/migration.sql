-- Phase: GoldenSoft staff identity profile (basic civil-ID style record).
-- Additive migration. Keeps UserProfile lean (auth/identity) and stores
-- staff personal details in a 1:1 extension table — not HR payroll fields.

CREATE TABLE "platform"."staff_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_profile_id" UUID NOT NULL,
    "title_code" TEXT NOT NULL,
    "first_name_th" TEXT NOT NULL,
    "last_name_th" TEXT NOT NULL,
    "first_name_en" TEXT,
    "last_name_en" TEXT,
    "national_id" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "address_line" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_profiles_user_profile_id_fkey"
        FOREIGN KEY ("user_profile_id") REFERENCES "platform"."user_profiles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staff_profiles_user_profile_id_key" UNIQUE ("user_profile_id"),
    CONSTRAINT "staff_profiles_national_id_key" UNIQUE ("national_id")
);

CREATE INDEX "staff_profiles_national_id_idx"
    ON "platform"."staff_profiles" ("national_id");
