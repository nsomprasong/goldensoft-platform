/**
 * Read-only readiness check for real user invitation (Phase 5C).
 * Never sends invites, never creates Auth users, never writes to the database.
 */
export {};

type Check = { name: string; ok: boolean; detail?: string };

function maskEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

function printChecks(checks: Check[]): void {
  for (const check of checks) {
    const status = check.ok ? "PASS" : "FAIL";
    const detail = check.detail ? ` (${check.detail})` : "";
    console.log(`${check.name}: ${status}${detail}`);
  }
}

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());

  const { assertSafeEnvironment, requireSafeEnvironment } = await import(
    "../src/lib/env/guard"
  );
  const {
    DEFAULT_INVITE_REDIRECT_PATH,
    InviteEnvironmentError,
    REAL_INVITE_CONFIRM_VALUE,
    resolveInviteEnvironment,
  } = await import("../src/lib/auth/invite-env");
  const { resolveRealInviteGate } = await import(
    "../src/lib/auth/real-invite-gate"
  );
  const {
    checkPlatformMigrationApplied,
  } = await import("./db-preflight");
  const {
    EXPECTED_INVITATION_STATUS_CODES,
    INVITATION_MIGRATION_NAME,
    INVITATION_TABLES,
  } = await import("./db-verify");
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");
  const { Pool } = await import("pg");

  const projectRoot = process.cwd();
  const checks: Check[] = [];

  const guard = assertSafeEnvironment({ projectRoot });
  if (!guard.ok) {
    console.error(`[ENV_GUARD] ${guard.code}: ${guard.reason}`);
    process.exit(1);
  }
  requireSafeEnvironment({ projectRoot });

  let environment;
  try {
    environment = resolveInviteEnvironment();
    checks.push({
      name: "AUTH_INVITE_MODE",
      ok: environment.mode === "mock" || environment.mode === "real",
      detail: environment.mode,
    });
    checks.push({
      name: "project_ref",
      ok: true,
      detail: environment.expectedProjectRef,
    });
    checks.push({
      name: "supabase_url_host",
      ok: Boolean(environment.supabaseUrl),
      detail: environment.supabaseUrl
        ? new URL(environment.supabaseUrl).hostname
        : "missing",
    });
    checks.push({
      name: "secret_key_present",
      ok: environment.mode === "mock" || Boolean(environment.secretKey),
      detail: environment.secretKey ? "set" : "missing",
    });
    checks.push({
      name: "NEXT_PUBLIC_APP_URL",
      ok: true,
      detail: environment.appUrl.origin,
    });
    checks.push({
      name: "redirect_url",
      ok: environment.redirectTo === `${environment.appUrl.origin}${environment.redirectPath}`,
      detail: environment.redirectTo,
    });
    checks.push({
      name: "redirect_origin",
      ok: new URL(environment.redirectTo).origin === environment.appUrl.origin,
      detail: new URL(environment.redirectTo).origin,
    });
    checks.push({
      name: "redirect_path",
      ok: environment.redirectPath === (process.env.SUPABASE_INVITE_REDIRECT_PATH ?? DEFAULT_INVITE_REDIRECT_PATH),
      detail: environment.redirectPath,
    });
  } catch (error) {
    const message =
      error instanceof InviteEnvironmentError
        ? `${error.code}: ${error.message}`
        : "invite environment invalid";
    checks.push({ name: "invite_environment", ok: false, detail: message });
    printChecks(checks);
    console.log("write_operations: NONE");
    console.log("invite_readiness: FAIL");
    process.exit(1);
  }

  const gate = resolveRealInviteGate();
  checks.push({
    name: "test_email_configured",
    ok: true,
    detail: gate.testEmailNormalized
      ? maskEmail(gate.testEmailNormalized)
      : "not_set",
  });
  checks.push({
    name: "confirmation_configured",
    ok: true,
    detail: gate.confirmValid
      ? "valid"
      : gate.confirmConfigured
        ? "invalid"
        : `not_set (need ${REAL_INVITE_CONFIRM_VALUE} to send)`,
  });
  checks.push({
    name: "real_adapter_ready",
    ok: environment.mode === "mock" || Boolean(environment.secretKey && environment.supabaseUrl),
    detail: environment.mode === "mock" ? "mock" : "real_config_present",
  });
  checks.push({
    name: "no_realtime",
    ok: true,
    detail: "invite path uses REST fetch only",
  });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    checks.push({ name: "database_connection", ok: false, detail: "DATABASE_URL missing" });
    printChecks(checks);
    console.log("write_operations: NONE");
    console.log("invite_readiness: FAIL");
    process.exit(1);
  }

  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    projectRoot,
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 1 }));

  try {
    const query = async (text: string, values?: unknown[]) =>
      pool.query(text, values);

    const migration = await checkPlatformMigrationApplied(
      query,
      INVITATION_MIGRATION_NAME,
    );
    checks.push({
      name: "invitation_migration_applied",
      ok: migration.applied,
      detail: `successful=${migration.appliedCount};rolled_back=${migration.rolledBackCount}`,
    });

    const tables = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'platform'
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1::text[])
      `,
      [INVITATION_TABLES as unknown as string[]],
    );
    checks.push({
      name: "invitation_tables",
      ok: Number(tables.rows[0]?.count ?? 0) === INVITATION_TABLES.length,
      detail: `count=${Number(tables.rows[0]?.count ?? 0)}`,
    });

    const statuses = await query(
      `
      SELECT COUNT(*)::int AS count
      FROM "platform"."user_invitation_statuses"
      WHERE "code" = ANY($1::text[])
      `,
      [EXPECTED_INVITATION_STATUS_CODES as unknown as string[]],
    );
    checks.push({
      name: "invitation_statuses",
      ok: Number(statuses.rows[0]?.count ?? 0) === EXPECTED_INVITATION_STATUS_CODES.length,
      detail: `count=${Number(statuses.rows[0]?.count ?? 0)}`,
    });
  } finally {
    await pool.end().catch(() => undefined);
  }

  // Auth Admin reachability (read-only). Never invite.
  if (environment.mode === "real" && environment.secretKey && environment.supabaseUrl) {
    try {
      const response = await fetch(
        new URL("/auth/v1/admin/users?page=1&per_page=1", environment.supabaseUrl),
        {
          method: "GET",
          headers: {
            apikey: environment.secretKey,
            Authorization: `Bearer ${environment.secretKey}`,
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      checks.push({
        name: "auth_admin_lookup",
        ok: response.ok,
        detail: response.ok ? "reachable" : `http_${response.status}`,
      });
    } catch {
      checks.push({
        name: "auth_admin_lookup",
        ok: false,
        detail: "network_error",
      });
    }
  } else {
    checks.push({
      name: "auth_admin_lookup",
      ok: true,
      detail: "skipped_in_mock_or_incomplete_config",
    });
  }

  printChecks(checks);
  console.log("write_operations: NONE");
  const ok = checks.every((check) => check.ok);
  console.log(`invite_readiness: ${ok ? "PASS" : "FAIL"}`);
  if (environment.mode === "mock") {
    console.log(
      "note: AUTH_INVITE_MODE is still mock — do not flip to real until PM approves the first send",
    );
  }
  if (!gate.confirmValid) {
    console.log(
      "note: real send remains gated until AUTH_REAL_INVITE_CONFIRM=SEND_ONE_REAL_INVITE",
    );
  }
  process.exit(ok ? 0 : 1);
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  process.argv[1].replace(/\\/g, "/").endsWith("scripts/verify-real-invite-readiness.ts");

if (isDirectRun) {
  main().catch((error) => {
    const message =
      error instanceof Error ? error.message : "auth:invite-readiness failed";
    console.error(
      "auth:invite-readiness failed:",
      message
        .replace(/:[^:@/]+@/g, ":***@")
        .replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g, "[redacted-pem]"),
    );
    console.log("write_operations: NONE");
    process.exit(1);
  });
}
