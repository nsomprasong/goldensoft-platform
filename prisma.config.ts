import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prefer .env.local (developer secrets) then .env
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

/**
 * Prisma CLI uses DIRECT_URL only (session pooler + sslmode=verify-full).
 * Runtime uses DATABASE_URL (transaction pooler) via @prisma/adapter-pg + trusted CA.
 *
 * Never fall back to DATABASE_URL for migrations — that URL must not carry sslmode params.
 */
const cliUrl =
  process.env.DIRECT_URL ||
  // Placeholder allows `prisma validate/generate` without local secrets.
  "postgresql://postgres.placeholder:placeholder@127.0.0.1:5432/postgres?sslmode=disable";

export default defineConfig({
  schema: "prisma/schema.prisma",
  engine: "classic",
  datasource: {
    url: cliUrl,
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
