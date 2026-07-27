-- Optional phone on user profiles for phone login / invite-without-email.

ALTER TABLE "platform"."user_profiles"
ADD COLUMN IF NOT EXISTS "phone" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "user_profiles_phone_key"
  ON "platform"."user_profiles" ("phone");
