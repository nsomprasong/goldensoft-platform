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

  it("phase 5B invitation migration supplies audit ids and stays additive", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../prisma/migrations/0003_user_invitations/migration.sql",
    );
    const sql = fs.readFileSync(migrationPath, "utf8");
    const result = checkAdditiveMigrationSql(sql);
    assert.equal(result.ok, true, result.errors.join("; "));
    assert.deepEqual(result.schemasTouched, ["platform"]);

    assert.match(
      sql,
      /INSERT INTO "platform"\."audit_action_types"\s*\(\s*"id",\s*"code",\s*"name_th",\s*"name_en",\s*"sort_order",\s*"created_at",\s*"updated_at"\s*\)/,
    );
    assert.match(sql, /ON CONFLICT \("code"\) DO NOTHING/);
    assert.equal(/\bCREATE\s+TYPE\b|\bAS\s+ENUM\b/i.test(sql), false);
    assert.equal(/\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bTRUNCATE\b/i.test(sql), false);

    const auditInsert = sql.slice(sql.indexOf('INSERT INTO "platform"."audit_action_types"'));
    assert.equal(
      (auditInsert.match(/gen_random_uuid\(\)/g) ?? []).length,
      9,
      "each audit row must call gen_random_uuid()",
    );
    assert.equal(
      (auditInsert.match(/CURRENT_TIMESTAMP/g) ?? []).length,
      18,
      "each audit row must set created_at and updated_at with CURRENT_TIMESTAMP",
    );

    // From 0001: id/code/name_th/name_en/updated_at have no DB default.
    // is_active/is_system/sort_order/created_at have defaults; created_at still set explicitly.
    for (const column of [
      '"id"',
      '"code"',
      '"name_th"',
      '"name_en"',
      '"sort_order"',
      '"created_at"',
      '"updated_at"',
    ]) {
      assert.ok(
        auditInsert.includes(column),
        `audit INSERT must include required column ${column}`,
      );
    }

    const expectedThai = [
      "รอส่งคำเชิญ",
      "ส่งคำเชิญแล้ว",
      "เปิดใช้งานแล้ว",
      "ส่งไม่สำเร็จ",
      "จัดเตรียมสิทธิ์ไม่สำเร็จ",
      "ยกเลิก",
      "หมดอายุ",
      "ร้องขอส่งคำเชิญ",
      "ส่งคำเชิญไม่สำเร็จ",
      "ร้องขอส่งคำเชิญอีกครั้ง",
      "ส่งคำเชิญอีกครั้งแล้ว",
      "ส่งคำเชิญอีกครั้งไม่สำเร็จ",
      "ยอมรับคำเชิญ",
      "จัดเตรียมสิทธิ์สำเร็จ",
    ];
    for (const text of expectedThai) {
      assert.ok(sql.includes(text), `migration must contain Thai text: ${text}`);
    }

    const mojibakePatterns = [/à¸/, /à¹/, /â€/, /เธ[\u0e00-\u0e7f]/, /เน€/];
    for (const pattern of mojibakePatterns) {
      assert.equal(
        pattern.test(sql),
        false,
        `migration must not contain mojibake: ${pattern.source}`,
      );
    }

    assert.match(
      sql,
      /CREATE TABLE "platform"\."user_invitation_statuses"[\s\S]*?"id" UUID NOT NULL DEFAULT gen_random_uuid\(\)/,
    );
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
