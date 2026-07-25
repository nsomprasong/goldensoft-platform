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
        | "SECRET_EXPOSED";
    };

const NEW_PROJECT_REF_DEFAULT = "horyhrnqbeaivdztekfv";
const LEGACY_PROJECT_REF_DEFAULT = "invnwpyshxdadhocueeh";

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

    // Fallback: detect known refs in non-password parts only
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

  if (appCode !== "PLATFORM") {
    return {
      ok: false,
      code: "APP_CODE",
      reason: "APP_CODE must be PLATFORM for GoldenSoft Platform",
    };
  }

  // Secret must never be mirrored into a NEXT_PUBLIC_* variable
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

  // Soft mode for local unit tests / generate when URLs are intentionally unset
  if (!supabaseUrl && !databaseUrl && !directUrl) {
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
    // Never include connection strings or secrets in the thrown message
    throw new Error(`[ENV_GUARD] ${result.code}: ${result.reason}`);
  }
}
