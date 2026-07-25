import { Client } from "pg";

import {
  assertSafeEnvironment,
  redactConnectionString,
  requireSafeEnvironment,
} from "../src/lib/env/guard";

async function main() {
  const guard = assertSafeEnvironment();
  if (!guard.ok) {
    console.error(`[ENV_GUARD] ${guard.code}: ${guard.reason}`);
    process.exit(1);
  }
  requireSafeEnvironment();

  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) {
    console.error(
      "DATABASE_URL and DIRECT_URL are required. Copy them from Supabase Connect Panel into .env.local first.",
    );
    process.exit(1);
  }

  const dbMeta = redactConnectionString(databaseUrl);
  const directMeta = redactConnectionString(directUrl);

  console.log("Environment guard: OK");
  console.log("Project ref:", guard.projectRef);
  console.log("DATABASE_URL host/port/db:", dbMeta.host, dbMeta.port, dbMeta.database);
  console.log("DIRECT_URL host/port/db:", directMeta.host, directMeta.port, directMeta.database);
  console.log("Username/password: [redacted]");

  // Read-only connectivity check via DIRECT_URL
  const client = new Client({ connectionString: directUrl });
  try {
    await client.connect();
    const ping = await client.query("select current_database() as db, current_user as usr");
    console.log("Read-only ping OK. database:", ping.rows[0]?.db);

    const schema = await client.query(
      `select schema_name from information_schema.schemata where schema_name = 'platform'`,
    );
    const tables = await client.query(
      `select table_name from information_schema.tables where table_schema = 'platform'`,
    );
    const migrations = await client.query(
      `select 1 from information_schema.tables
       where table_schema = 'platform' and table_name = '_prisma_migrations'
       limit 1`,
    );

    if (schema.rowCount && tables.rowCount && tables.rowCount > 0) {
      console.log(
        `Note: schema platform already has ${tables.rowCount} table(s). Review before applying migrations.`,
      );
    } else {
      console.log("Platform schema tables: none yet (ready for initial migration after approval)");
    }

    if (migrations.rowCount) {
      console.log("Prisma migrations table detected under platform (inspect before deploy)");
    } else {
      console.log("No platform Prisma migration history detected");
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "preflight failed";
  // Strip any accidental credential fragments
  console.error("db:preflight failed:", message.replace(/:[^:@/]+@/g, ":***@"));
  process.exit(1);
});
