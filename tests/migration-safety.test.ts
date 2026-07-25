import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { checkAdditiveMigrationSql, checkMigrationSql } from "../src/lib/db/migration-safety";

describe("Migration SQL safety", () => {
  it("platform initial migration touches only platform schema", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../prisma/migrations/0001_platform_initial/migration.sql",
    );
    assert.ok(fs.existsSync(migrationPath), "migration.sql must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");
    const result = checkMigrationSql(sql);
    assert.equal(result.ok, true, result.errors.join("; "));
    assert.deepEqual(result.schemasTouched, ["platform"]);
  });

  it("phase 5 additive migration is platform-only", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../prisma/migrations/0002_phase5_admin_fields/migration.sql",
    );
    const sql = fs.readFileSync(migrationPath, "utf8");
    const result = checkAdditiveMigrationSql(sql);
    assert.equal(result.ok, true, result.errors.join("; "));
    assert.deepEqual(result.schemasTouched, ["platform"]);
  });

  it("rejects SQL that alters auth schema", () => {
    const result = checkMigrationSql(`
      CREATE SCHEMA IF NOT EXISTS platform;
      CREATE TABLE "platform"."user_profile_statuses" (id uuid);
      ALTER TABLE auth.users ADD COLUMN hacked text;
    `);
    assert.equal(result.ok, false);
  });

  it("rejects PostgreSQL enum DDL", () => {
    const result = checkMigrationSql(`
      CREATE SCHEMA IF NOT EXISTS platform;
      CREATE TYPE "platform"."SubscriptionStatus" AS ENUM ('ACTIVE');
    `);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /ENUM|CREATE TYPE/i.test(e)));
  });
});
