import fs from "node:fs";
import path from "node:path";

import { checkMigrationSql } from "../src/lib/db/migration-safety";

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  "prisma/migrations/0001_platform_initial/migration.sql",
);

function main() {
  if (!fs.existsSync(MIGRATION_PATH)) {
    console.error(`Missing migration file: ${MIGRATION_PATH}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  const result = checkMigrationSql(sql);
  console.log(
    "Migration schemas touched:",
    result.schemasTouched.join(", ") || "(none parsed)",
  );
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("Migration SQL safety check OK (platform only)");
}

main();
