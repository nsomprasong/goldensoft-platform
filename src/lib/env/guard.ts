import fs from "node:fs";
import path from "node:path";

import {
  assertCaCertificateFile,
  isPathInsideProjectRoot,
  normalizeConfiguredPath,
  resolveDirectSslRootCertPath,
  resolveProjectRelativePath,
} from "../db/ca-certificate";

export type EnvGuardInput = {
  appCode?: string;
  nodeEnv?: string;
  supabaseUrl?: string;
  databaseUrl?: string;
  directUrl?: string;
  expectedProjectRef?: string;
  blockedLegacyProjectRef?: string;
  publishableKey?: string;
  secretKey?: string;
  allowTestAuth?: string;
  caCertPath?: string;
  projectRoot?: string;
};

export type EnvGuardResult =
  | { ok: true; projectRef: string }
  | {
      ok: false;
      reason: string;
      code:
        | "APP_CODE"
        | "LEGACY_BLOCKED"
        | "UNEXPECTED_REF"
        | "REF_MISMATCH"
        | "INVALID_URL"
        | "MISSING_URLS"
        | "TEST_AUTH_IN_PRODUCTION"
        | "MISSING_PUBLISHABLE_KEY"
        | "SECRET_EXPOSED"
        | "CA_CERT_MISSING"
        | "CA_CERT_INVALID"
        | "DATABASE_URL_SSL_PARAM"
        | "DIRECT_URL_TLS";
    };

const NEW_PROJECT_REF_DEFAULT = "horyhrnqbeaivdztekfv";
const LEGACY_PROJECT_REF_DEFAULT = "invnwpyshxdadhocueeh";
const FORBIDDEN_DATABASE_SSL_PARAMS = [
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
] as const;

export function isTestAuthEnabled(value?: string): boolean {
  const raw = (value ?? process.env.ALLOW_TEST_AUTH ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function extractSupabaseProjectRef(supabaseUrl: string): string | null {
  try {
    const url = new URL(supabaseUrl);
    const match = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** Extract project ref from Postgres connection string without exposing secrets. */
export function extractProjectRefFromConnectionString(
  connectionString: string,
): string | null {
  try {
    const normalized = connectionString
      .replace(/^postgresql:/i, "http:")
      .replace(/^postgres:/i, "http:");
    const url = new URL(normalized);

    const user = decodeURIComponent(url.username);
    const userMatch = user.match(/^(?:postgres\.)([a-z0-9]+)$/i);
    if (userMatch?.[1]) return userMatch[1].toLowerCase();

    const dbHost = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (dbHost?.[1]) return dbHost[1].toLowerCase();

    const hostAndUser = `${user}@${url.hostname}`.toLowerCase();
    return nullIfAmbiguousRef(hostAndUser);
  } catch {
    return null;
  }
}

function nullIfAmbiguousRef(haystack: string): string | null {
  const expected = (
    process.env.EXPECTED_SUPABASE_PROJECT_REF ?? NEW_PROJECT_REF_DEFAULT
  ).toLowerCase();
  const blocked = (
    process.env.BLOCKED_LEGACY_SUPABASE_PROJECT_REF ?? LEGACY_PROJECT_REF_DEFAULT
  ).toLowerCase();
  const hasExpected = haystack.includes(expected);
  const hasBlocked = haystack.includes(blocked);
  if (hasBlocked && !hasExpected) return blocked;
  if (hasExpected && !hasBlocked) return expected;
  return null;
}

export function connectionStringContainsRef(
  connectionString: string,
  projectRef: string,
): boolean {
  return connectionString.toLowerCase().includes(projectRef.toLowerCase());
}

export function redactConnectionString(connectionString: string): {
  host: string;
  port: string;
  database: string;
  projectRef: string | null;
} {
  try {
    const normalized = connectionString
      .replace(/^postgresql:/i, "http:")
      .replace(/^postgres:/i, "http:");
    const url = new URL(normalized);
    return {
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, "") || "postgres",
      projectRef: extractProjectRefFromConnectionString(connectionString),
    };
  } catch {
    return {
      host: "[unparseable]",
      port: "?",
      database: "?",
      projectRef: null,
    };
  }
}

function parsePgUrl(connectionString: string): URL | null {
  try {
    return new URL(
      connectionString
        .replace(/^postgresql:/i, "http:")
        .replace(/^postgres:/i, "http:"),
    );
  } catch {
    return null;
  }
}

export function databaseUrlHasForbiddenSslParams(
  databaseUrl: string,
): string | null {
  const url = parsePgUrl(databaseUrl);
  if (!url) return null;
  for (const key of FORBIDDEN_DATABASE_SSL_PARAMS) {
    if (url.searchParams.has(key)) return key;
  }
  return null;
}

function validateCaCertificateFile(
  caCertPath: string | undefined,
  projectRoot: string,
): EnvGuardResult | null {
  const configured = caCertPath ? normalizeConfiguredPath(caCertPath) : "";
  if (!configured) {
    return {
      ok: false,
      code: "CA_CERT_MISSING",
      reason: "SUPABASE_DB_CA_CERT_PATH is required",
    };
  }

  let absolutePath: string;
  try {
    // Same shared resolver as CA utility: path.resolve(cwd, configuredPath)
    absolutePath = resolveProjectRelativePath(configured, projectRoot);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid CA certificate path";
    return { ok: false, code: "CA_CERT_INVALID", reason: message };
  }

  if (!isPathInsideProjectRoot(absolutePath, projectRoot)) {
    return {
      ok: false,
      code: "CA_CERT_INVALID",
      reason: `CA certificate path must stay inside the project root: ${absolutePath}`,
    };
  }

  try {
    assertCaCertificateFile(absolutePath);
    const content = fs.readFileSync(absolutePath, "utf8").trim();
    if (!content) {
      return {
        ok: false,
        code: "CA_CERT_INVALID",
        reason: `CA certificate file is empty: ${absolutePath}`,
      };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid CA certificate file";
    if (/does not exist/i.test(message)) {
      return { ok: false, code: "CA_CERT_MISSING", reason: message };
    }
    return { ok: false, code: "CA_CERT_INVALID", reason: message };
  }

  return null;
}

/**
 * Validate DIRECT_URL TLS query params for Prisma CLI.
 * Does not open/read sslrootcert — Prisma resolves that from the prisma/ folder later.
 * Preflight must never connect with DIRECT_URL.
 */
function validateDirectUrlTls(
  directUrl: string,
  projectRoot: string,
): EnvGuardResult | null {
  const url = parsePgUrl(directUrl);
  if (!url) {
    return {
      ok: false,
      code: "INVALID_URL",
      reason: "Unable to parse DIRECT_URL",
    };
  }

  if (url.searchParams.get("sslmode") !== "verify-full") {
    return {
      ok: false,
      code: "DIRECT_URL_TLS",
      reason: "DIRECT_URL must use sslmode=verify-full",
    };
  }

  const sslrootcert = url.searchParams.get("sslrootcert");
  if (!sslrootcert?.trim()) {
    return {
      ok: false,
      code: "DIRECT_URL_TLS",
      reason: "DIRECT_URL must include sslrootcert",
    };
  }

  // Path-shape check only (no fs). Ensures ../certs/... stays inside the repo
  // when resolved from prisma/, without opening the file during preflight.
  try {
    resolveDirectSslRootCertPath(sslrootcert, projectRoot);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid DIRECT_URL sslrootcert";
    return { ok: false, code: "DIRECT_URL_TLS", reason: message };
  }

  return null;
}

/** Safe metadata for logging DIRECT_URL without secrets or opening sslrootcert. */
export function describeDirectUrlTls(directUrl: string): {
  sslmode: string | null;
  hasSslRootCert: boolean;
} {
  const url = parsePgUrl(directUrl);
  if (!url) {
    return { sslmode: null, hasSslRootCert: false };
  }
  return {
    sslmode: url.searchParams.get("sslmode"),
    hasSslRootCert: url.searchParams.has("sslrootcert"),
  };
}

export function assertSafeEnvironment(
  input: EnvGuardInput = {},
): EnvGuardResult {
  const appCode = input.appCode ?? process.env.APP_CODE;
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const supabaseUrl = input.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const databaseUrl = input.databaseUrl ?? process.env.DATABASE_URL;
  const directUrl = input.directUrl ?? process.env.DIRECT_URL;
  const expected = (
    input.expectedProjectRef ??
    process.env.EXPECTED_SUPABASE_PROJECT_REF ??
    NEW_PROJECT_REF_DEFAULT
  ).toLowerCase();
  const blocked = (
    input.blockedLegacyProjectRef ??
    process.env.BLOCKED_LEGACY_SUPABASE_PROJECT_REF ??
    LEGACY_PROJECT_REF_DEFAULT
  ).toLowerCase();
  const publishableKey =
    input.publishableKey ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = input.secretKey ?? process.env.SUPABASE_SECRET_KEY;
  const allowTestAuth = input.allowTestAuth ?? process.env.ALLOW_TEST_AUTH;
  const caCertPath =
    input.caCertPath ?? process.env.SUPABASE_DB_CA_CERT_PATH;
  // Always resolve CA paths from process.cwd() unless tests inject projectRoot.
  const projectRoot = path.resolve(input.projectRoot ?? process.cwd());

  if (appCode !== "PLATFORM") {
    return {
      ok: false,
      code: "APP_CODE",
      reason: "APP_CODE must be PLATFORM for GoldenSoft Platform",
    };
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (
      key.startsWith("NEXT_PUBLIC_") &&
      secretKey &&
      value &&
      value === secretKey
    ) {
      return {
        ok: false,
        code: "SECRET_EXPOSED",
        reason: "Secret key must not appear in NEXT_PUBLIC_* variables",
      };
    }
  }

  if (nodeEnv === "production" && isTestAuthEnabled(allowTestAuth)) {
    return {
      ok: false,
      code: "TEST_AUTH_IN_PRODUCTION",
      reason: "ALLOW_TEST_AUTH is forbidden in production",
    };
  }

  if (nodeEnv === "production" && !publishableKey?.trim()) {
    return {
      ok: false,
      code: "MISSING_PUBLISHABLE_KEY",
      reason: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required in production",
    };
  }

  const urlsPresent = Boolean(supabaseUrl || databaseUrl || directUrl);

  // Soft mode for local unit tests / generate when URLs are intentionally unset
  if (!urlsPresent) {
    if (nodeEnv === "production") {
      const caError = validateCaCertificateFile(caCertPath, projectRoot);
      if (caError) return caError;
    }
    return { ok: true, projectRef: expected };
  }

  if (!supabaseUrl || !databaseUrl || !directUrl) {
    return {
      ok: false,
      code: "MISSING_URLS",
      reason:
        "NEXT_PUBLIC_SUPABASE_URL, DATABASE_URL, and DIRECT_URL are all required together",
    };
  }

  const caError = validateCaCertificateFile(caCertPath, projectRoot);
  if (caError) return caError;

  const forbiddenSsl = databaseUrlHasForbiddenSslParams(databaseUrl);
  if (forbiddenSsl) {
    return {
      ok: false,
      code: "DATABASE_URL_SSL_PARAM",
      reason: `DATABASE_URL must not include ${forbiddenSsl}; runtime supplies trusted SSL via pg`,
    };
  }

  const directTlsError = validateDirectUrlTls(directUrl, projectRoot);
  if (directTlsError) return directTlsError;

  const refs = [
    extractSupabaseProjectRef(supabaseUrl),
    extractProjectRefFromConnectionString(databaseUrl),
    extractProjectRefFromConnectionString(directUrl),
  ];

  for (const value of [supabaseUrl, databaseUrl, directUrl]) {
    if (connectionStringContainsRef(value, blocked)) {
      return {
        ok: false,
        code: "LEGACY_BLOCKED",
        reason:
          "Blocked Legacy Supabase project ref detected — refusing to start, seed, or migrate",
      };
    }
  }

  if (refs.some((ref) => ref === null)) {
    return {
      ok: false,
      code: "INVALID_URL",
      reason: "Unable to resolve Supabase project ref from one or more URLs",
    };
  }

  const [apiRef, dbRef, directRef] = refs as [string, string, string];

  if (apiRef !== dbRef || apiRef !== directRef) {
    return {
      ok: false,
      code: "REF_MISMATCH",
      reason: "Project refs from Supabase URL, DATABASE_URL, and DIRECT_URL must match",
    };
  }

  if (apiRef === blocked) {
    return {
      ok: false,
      code: "LEGACY_BLOCKED",
      reason:
        "Blocked Legacy Supabase project ref detected — refusing to start, seed, or migrate",
    };
  }

  if (apiRef !== expected) {
    return {
      ok: false,
      code: "UNEXPECTED_REF",
      reason: "Supabase project ref does not match EXPECTED_SUPABASE_PROJECT_REF",
    };
  }

  return { ok: true, projectRef: apiRef };
}

export function requireSafeEnvironment(input?: EnvGuardInput): void {
  const result = assertSafeEnvironment(input);
  if (!result.ok) {
    throw new Error(`[ENV_GUARD] ${result.code}: ${result.reason}`);
  }
}
