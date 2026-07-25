export type EnvGuardInput = {
  appCode?: string;
  supabaseUrl?: string;
  expectedProjectRef?: string;
  blockedLegacyProjectRef?: string;
};

export type EnvGuardResult =
  | { ok: true; projectRef: string | null }
  | { ok: false; reason: string; code: "APP_CODE" | "LEGACY_BLOCKED" | "UNEXPECTED_REF" | "INVALID_URL" };

export function extractSupabaseProjectRef(supabaseUrl: string): string | null {
  try {
    const url = new URL(supabaseUrl);
    const host = url.hostname;
    // https://<project-ref>.supabase.co
    const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function assertSafeEnvironment(input: EnvGuardInput = {}): EnvGuardResult {
  const appCode = input.appCode ?? process.env.APP_CODE;
  const supabaseUrl = input.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const expected =
    input.expectedProjectRef ?? process.env.EXPECTED_SUPABASE_PROJECT_REF;
  const blocked =
    input.blockedLegacyProjectRef ??
    process.env.BLOCKED_LEGACY_SUPABASE_PROJECT_REF;

  if (appCode !== "PLATFORM") {
    return {
      ok: false,
      code: "APP_CODE",
      reason: "APP_CODE must be PLATFORM for GoldenSoft Platform",
    };
  }

  if (!supabaseUrl) {
    return { ok: true, projectRef: null };
  }

  const projectRef = extractSupabaseProjectRef(supabaseUrl);
  if (!projectRef) {
    return {
      ok: false,
      code: "INVALID_URL",
      reason: "NEXT_PUBLIC_SUPABASE_URL is not a valid Supabase project URL",
    };
  }

  if (blocked && projectRef === blocked) {
    return {
      ok: false,
      code: "LEGACY_BLOCKED",
      reason:
        "Blocked Legacy Supabase project ref detected — refusing to start, seed, or migrate",
    };
  }

  if (expected && projectRef !== expected) {
    return {
      ok: false,
      code: "UNEXPECTED_REF",
      reason: "Supabase project ref does not match EXPECTED_SUPABASE_PROJECT_REF",
    };
  }

  return { ok: true, projectRef };
}

export function requireSafeEnvironment(input?: EnvGuardInput): void {
  const result = assertSafeEnvironment(input);
  if (!result.ok) {
    throw new Error(`[ENV_GUARD] ${result.code}: ${result.reason}`);
  }
}
