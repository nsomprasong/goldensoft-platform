import fs from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { parse as parseEnv } from "dotenv";

/** Env keys Environment Guard resolves; must come from project files, not IDE stubs. */
const PROJECT_URL_KEYS = [
  "APP_CODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "DATABASE_URL",
  "DIRECT_URL",
] as const;

/**
 * Shell/session bootstrap inputs. Never overwrite these from `.env` / `.env.local`
 * so temporary PowerShell values remain authoritative for one-time scripts.
 */
const PRESERVED_SHELL_KEYS = [
  "BOOTSTRAP_AUTH_USER_ID",
  "BOOTSTRAP_ADMIN_EMAIL",
  "BOOTSTRAP_ADMIN_DISPLAY_NAME",
  "BOOTSTRAP_ORGANIZATION_CODE",
  "BOOTSTRAP_BRANCH_CODE",
  "BOOTSTRAP_CONFIRM",
  "ORGANIZATION_BOOTSTRAP_CONFIRM",
  "GOLDENSOFT_INTERNAL_CONFIRM",
  "GOLDENSOFT_INTERNAL_ADMIN_EMAIL",
  "GOLDENSOFT_INTERNAL_EMPLOYEE_CODE",
  "GOLDENSOFT_INTERNAL_FIRST_NAME_TH",
  "GOLDENSOFT_INTERNAL_LAST_NAME_TH",
  "GOLDENSOFT_INTERNAL_FIRST_NAME_EN",
  "GOLDENSOFT_INTERNAL_LAST_NAME_EN",
  "GOLDENSOFT_INTERNAL_DISPLAY_NAME",
] as const;

/**
 * Load project `.env.local` / `.env` for CLI scripts.
 *
 * Next.js `loadEnvConfig` snapshots `process.env` on first call and will not
 * override those keys on later loads — even with `forceReload` and after
 * deleting ambient stubs. Re-apply Guard URL keys from project files so
 * `.env.local` always wins over IDE/shell stubs (same intent as db:preflight).
 *
 * Bootstrap confirmation / identity vars set in the current shell are preserved.
 */
export function loadProjectEnv(projectRoot: string = process.cwd()): void {
  const preserved: Partial<Record<(typeof PRESERVED_SHELL_KEYS)[number], string>> =
    {};
  for (const key of PRESERVED_SHELL_KEYS) {
    const value = process.env[key];
    if (typeof value === "string") {
      preserved[key] = value;
    }
  }

  for (const key of PROJECT_URL_KEYS) {
    delete process.env[key];
  }

  loadEnvConfig(
    projectRoot,
    process.env.NODE_ENV !== "production",
    undefined,
    true,
  );

  // Lowest priority first; `.env.local` overwrites `.env`.
  const envFiles = [".env", ".env.local"] as const;
  for (const name of envFiles) {
    const fullPath = path.join(projectRoot, name);
    if (!fs.existsSync(fullPath)) continue;
    const parsed = parseEnv(fs.readFileSync(fullPath));
    for (const key of PROJECT_URL_KEYS) {
      const value = parsed[key];
      if (typeof value === "string" && value.length > 0) {
        process.env[key] = value;
      }
    }
  }

  for (const key of PRESERVED_SHELL_KEYS) {
    const value = preserved[key];
    if (typeof value === "string") {
      process.env[key] = value;
    }
  }
}
