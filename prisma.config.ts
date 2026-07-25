import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prefer .env.local (developer secrets) then .env
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

/**
 * Prisma CLI uses DIRECT_URL (session pooler) for schema engine / migrations.
 * Runtime application code uses DATABASE_URL (transaction pooler) via @prisma/adapter-pg.
 *
 * Connection strings must be copied from the Supabase Connect Panel — never invented.
 */
const cliUrl =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  // Placeholder allows `prisma validate/generate` without local secrets.
  "postgresql://postgres.placeholder:placeholder@127.0.0.1:5432/postgres";

export default defineConfig({
  schema: "prisma/schema.prisma",
  engine: "classic",
  datasource: {
    url: cliUrl,
    directUrl: process.env.DIRECT_URL || undefined,
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
