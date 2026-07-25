import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const root = path.resolve(__dirname, "../..");
const testDbPath = path.join(root, "prisma", "test.db");

export function setupTestEnv() {
  process.env.APP_CODE = "PLATFORM";
  process.env.EXPECTED_SUPABASE_PROJECT_REF = "new-platform-ref";
  process.env.BLOCKED_LEGACY_SUPABASE_PROJECT_REF = "legacy-blocked-ref";
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    "https://new-platform-ref.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.PLATFORM_CONTEXT_COOKIE_SECRET =
    "test-cookie-secret-at-least-32-chars";
  process.env.ALLOW_TEST_AUTH = "1";
  process.env.DATABASE_URL = `file:${testDbPath}`;
}

export function resetTestDatabase() {
  setupTestEnv();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  // File already removed above — plain db push creates a fresh local SQLite schema.
  execSync("npx prisma db push --skip-generate", {
    cwd: root,
    env: process.env,
    stdio: "pipe",
  });
}

export function createTestPrisma() {
  setupTestEnv();
  return new PrismaClient();
}
