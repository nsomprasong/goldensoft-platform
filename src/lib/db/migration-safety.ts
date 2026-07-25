const ALLOWED_SCHEMA = "platform";

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

  return {
    ok: errors.length === 0,
    errors,
    schemasTouched: [...schemasTouched],
  };
}
