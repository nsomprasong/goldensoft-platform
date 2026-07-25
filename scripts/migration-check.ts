import fs from "node:fs";
import path from "node:path";

import {
  checkAdditiveMigrationSql,
  checkMigrationSql,
} from "../src/lib/db/migration-safety";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "prisma/migrations");

function main() {
  const entries = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  if (entries.length === 0) {
    console.error("No migration directories found");
    process.exit(1);
  }

  let failed = false;
  for (const name of entries) {
    const migrationPath = path.join(MIGRATIONS_DIR, name, "migration.sql");
    if (!fs.existsSync(migrationPath)) {
      console.error(`Missing migration file: ${migrationPath}`);
      failed = true;
      continue;
    }

    const sql = fs.readFileSync(migrationPath, "utf8");
    const isInitial = name.startsWith("0001_");
    const result = isInitial
      ? checkMigrationSql(sql)
      : checkAdditiveMigrationSql(sql);

    console.log(
      `${name}: schemas=${result.schemasTouched.join(", ") || "(none)"} kind=${isInitial ? "initial" : "additive"}`,
    );
    if (!result.ok) {
      failed = true;
      for (const error of result.errors) {
        console.error(`  - ${error}`);
      }
    } else {
      console.log(`  OK`);
    }
  }

  if (failed) {
    process.exit(1);
  }
  console.log("Migration SQL safety check OK (platform only)");
}

main();
