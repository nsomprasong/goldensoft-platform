const ALLOWED_SCHEMA = "platform";

const REQUIRED_MASTER_TABLES = [
  "user_profile_statuses",
  "platform_roles",
  "assignment_statuses",
  "organization_statuses",
  "branch_statuses",
  "membership_statuses",
  "organization_roles",
  "branch_scope_types",
  "product_statuses",
  "feature_statuses",
  "plan_statuses",
  "plan_version_statuses",
  "billing_cycles",
  "subscription_statuses",
  "subscription_override_types",
  "product_membership_statuses",
  "outbox_event_statuses",
  "idempotency_statuses",
  "legacy_migration_statuses",
  "feature_value_types",
  "audit_action_types",
];

export function checkMigrationSql(sql: string): {
  ok: boolean;
  errors: string[];
  schemasTouched: string[];
} {
  const errors: string[] = [];
  const schemasTouched = new Set<string>();

  if (!sql.trim()) {
    errors.push("Migration SQL is empty");
  }

  if (!/CREATE\s+SCHEMA\s+(IF\s+NOT\s+EXISTS\s+)?"?platform"?/i.test(sql)) {
    errors.push('Migration must create schema "platform"');
  }

  if (/CREATE\s+TYPE\b/i.test(sql)) {
    errors.push("Migration must not contain CREATE TYPE (no PostgreSQL enums)");
  }

  if (/\bAS\s+ENUM\b/i.test(sql)) {
    errors.push("Migration must not contain AS ENUM");
  }

  for (const match of sql.matchAll(/"([a-z0-9_]+)"\./gi)) {
    schemasTouched.add(match[1]!.toLowerCase());
  }

  for (const schema of schemasTouched) {
    if (schema !== ALLOWED_SCHEMA) {
      errors.push(`Migration touches unexpected schema: ${schema}`);
    }
  }

  for (const forbidden of ["auth", "public", "resident_v2", "hr", "qrstation"]) {
    const ddl = new RegExp(
      String.raw`\b(CREATE|ALTER|DROP|TRUNCATE)\s+(TABLE|SCHEMA|TYPE|INDEX|ENUM)[^;]*\b${forbidden}\b`,
      "i",
    );
    if (ddl.test(sql)) {
      errors.push(`Forbidden DDL targeting schema/object ${forbidden}`);
    }
  }

  if (/\b(DROP|ALTER)\s+TABLE\b/i.test(sql) && !/CREATE\s+TABLE\b/i.test(sql)) {
    errors.push("Migration appears to alter/drop without create — expected initial create only");
  }

  for (const table of REQUIRED_MASTER_TABLES) {
    if (!sql.includes(`"${table}"`)) {
      errors.push(`Missing master table in migration: ${table}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    schemasTouched: [...schemasTouched],
  };
}
