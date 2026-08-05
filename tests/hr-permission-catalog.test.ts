import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  HR_PERMISSIONS,
  HR_PERMISSION_CATALOG,
  HR_PERMISSION_CODES,
  HR_PERMISSION_LABELS,
  HR_PRODUCT_CODE,
  hrPermissionLabel,
  isHrPermissionCode,
} from "../src/lib/permissions/hr-codes";

const ROOT = path.resolve(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

const REQUIRED: Array<[string, string, string, string]> = [
  ["hr.employee.read", "ดูพนักงาน", "employee", "read"],
  ["hr.employee.create", "สร้างพนักงาน", "employee", "create"],
  ["hr.employee.update", "แก้ไขพนักงาน", "employee", "update"],
  ["hr.employee.deactivate", "ปิดใช้งานพนักงาน", "employee", "deactivate"],
  ["hr.employee.link_user", "ผูกผู้ใช้ Platform", "employee", "link_user"],
  ["hr.schedule.read", "ดูตารางงาน", "schedule", "read"],
  ["hr.schedule.manage", "จัดการตารางงาน", "schedule", "manage"],
  ["hr.schedule.publish", "เผยแพร่ตารางงาน", "schedule", "publish"],
  ["hr.attendance.self", "ดูเวลาทำงานของตนเอง", "attendance", "self"],
  ["hr.attendance.read", "ดูเวลาทำงาน", "attendance", "read"],
  ["hr.attendance.manage", "จัดการเวลาทำงาน", "attendance", "manage"],
  ["hr.attendance.override", "แก้ไขข้อยกเว้นเวลาทำงาน", "attendance", "override"],
  ["hr.leave.self", "จัดการการลาของตนเอง", "leave", "self"],
  ["hr.leave.read", "ดูการลา", "leave", "read"],
  ["hr.leave.manage", "จัดการการลา", "leave", "manage"],
  ["hr.leave.approve", "อนุมัติการลา", "leave", "approve"],
  ["hr.overtime.self", "จัดการ OT ของตนเอง", "overtime", "self"],
  ["hr.overtime.read", "ดู OT", "overtime", "read"],
  ["hr.overtime.manage", "จัดการ OT", "overtime", "manage"],
  ["hr.overtime.approve", "อนุมัติ OT", "overtime", "approve"],
  ["hr.compensation.read", "ดูค่าจ้าง", "compensation", "read"],
  ["hr.compensation.manage", "จัดการค่าจ้าง", "compensation", "manage"],
  ["hr.payroll.read", "ดูเงินเดือน", "payroll", "read"],
  ["hr.payroll.calculate", "คำนวณเงินเดือน", "payroll", "calculate"],
  ["hr.payroll.review", "ตรวจสอบเงินเดือน", "payroll", "review"],
  ["hr.payroll.approve", "อนุมัติเงินเดือน", "payroll", "approve"],
  ["hr.payroll.mark_paid", "บันทึกว่าจ่ายแล้ว", "payroll", "mark_paid"],
  ["hr.payroll.lock", "ล็อกงวดเงินเดือน", "payroll", "lock"],
  ["hr.payslip.self", "ดูสลิปเงินเดือนของตนเอง", "payslip", "self"],
  ["hr.payslip.read", "ดูสลิปเงินเดือน", "payslip", "read"],
  ["hr.advance.self", "ขอเบิกล่วงหน้าของตนเอง", "advance", "self"],
  ["hr.advance.approve", "อนุมัติเบิกล่วงหน้า", "advance", "approve"],
  ["hr.department.manage", "จัดการแผนก", "department", "manage"],
  ["hr.position.manage", "จัดการตำแหน่ง", "position", "manage"],
  ["hr.employee.role.assign", "กำหนดบทบาทให้พนักงาน", "employee_role", "assign"],
  ["hr.employee.role.assign_privileged", "กำหนดบทบาทสำคัญให้พนักงาน", "employee_role", "assign_privileged"],
  ["hr.shift.read", "ดูกะงาน", "shift", "read"],
  ["hr.shift.manage", "จัดการกะงาน", "shift", "manage"],
  ["hr.location.manage", "จัดการสถานที่ทำงาน", "location", "manage"],
  ["hr.calendar.manage", "จัดการปฏิทิน", "calendar", "manage"],
  ["hr.report.read", "ดูรายงาน HR", "report", "read"],
  ["hr.approval.read", "ดูรายการอนุมัติ", "approval", "read"],
  ["hr.approval.manage", "จัดการรายการอนุมัติ", "approval", "manage"],
  ["hr.payroll_schedule.read", "ดูรอบจ่าย", "payroll_schedule", "read"],
  ["hr.payroll_schedule.manage", "จัดการรอบจ่าย", "payroll_schedule", "manage"],
  ["hr.payroll_period.read", "ดูงวดเงินเดือน", "payroll_period", "read"],
  ["hr.payroll_period.manage", "จัดการงวดเงินเดือน", "payroll_period", "manage"],
  ["hr.settings.manage", "จัดการตั้งค่า HR", "settings", "manage"],
];

describe("HR permission catalog codes", () => {
  it("exposes every required HR permission code with a Thai label", () => {
    const values = Object.values(HR_PERMISSIONS) as string[];
    for (const [code, nameTh] of REQUIRED) {
      assert.ok(values.includes(code), `missing code ${code}`);
      assert.equal(HR_PERMISSION_LABELS[code as never], nameTh);
      assert.notEqual(HR_PERMISSION_LABELS[code as never], code);
    }
    assert.equal(values.length, REQUIRED.length);
  });

  it("maps each catalog row to GOLDENSOFT_HR with resource and action", () => {
    assert.equal(HR_PRODUCT_CODE, "GOLDENSOFT_HR");
    assert.equal(HR_PERMISSION_CATALOG.length, REQUIRED.length);

    for (const [code, nameTh, resource, action] of REQUIRED) {
      const entry = HR_PERMISSION_CATALOG.find((row) => row.code === code);
      assert.ok(entry, `missing catalog entry ${code}`);
      assert.equal(entry.productCode, "GOLDENSOFT_HR");
      assert.equal(entry.nameTh, nameTh);
      assert.equal(entry.resource, resource);
      assert.equal(entry.action, action);
      assert.ok(entry.nameEn.length > 0, `missing nameEn for ${code}`);
      assert.ok(entry.sortOrder > 0, `missing sortOrder for ${code}`);
    }
  });

  it("keeps codes and sort orders unique for upsert by code", () => {
    assert.equal(new Set(HR_PERMISSION_CODES).size, HR_PERMISSION_CODES.length);
    const sortOrders = HR_PERMISSION_CATALOG.map((row) => row.sortOrder);
    assert.equal(new Set(sortOrders).size, sortOrders.length);
  });

  it("recognises HR codes and falls back to the raw code otherwise", () => {
    assert.equal(isHrPermissionCode("hr.employee.read"), true);
    assert.equal(isHrPermissionCode("platform.user.read"), false);
    assert.equal(hrPermissionLabel("hr.shift.manage"), "จัดการกะงาน");
    assert.equal(hrPermissionLabel("platform.user.read"), "platform.user.read");
  });
});

describe("HR permission catalog seed script", () => {
  it("ships the seed script and npm entrypoint", () => {
    assert.ok(exists("scripts/seed-hr-permission-catalog.ts"));
    assert.match(
      read("package.json"),
      /"seed:hr-permissions":\s*"tsx scripts\/seed-hr-permission-catalog\.ts"/,
    );
  });

  it("loads project env and upserts by code", () => {
    const source = read("scripts/seed-hr-permission-catalog.ts");
    assert.match(source, /loadProjectEnv/);
    assert.match(source, /HR_PERMISSION_CATALOG/);
    assert.match(source, /permission\.upsert/);
    assert.match(source, /where:\s*\{\s*code:\s*entry\.code\s*\}/);
    assert.match(source, /HR permissions upserted/);
  });

  it("accepts system mode only and refuses production demo", () => {
    const source = read("scripts/seed-hr-permission-catalog.ts");
    assert.match(source, /resolveSeedMode/);
    assert.match(source, /mode !== "system"/);
    assert.match(source, /development-demo[\s\S]*NODE_ENV === "production"/);
  });

  it("applies no migration and no DDL", () => {
    const source = read("scripts/seed-hr-permission-catalog.ts");
    assert.doesNotMatch(
      source,
      /migrate deploy|migrate dev|db push|migrate resolve/,
    );
    assert.doesNotMatch(source, /\$executeRaw|\$queryRaw/);
    assert.doesNotMatch(source, /\bALTER TABLE\b|\bCREATE INDEX\b|\bDROP\b/i);
  });

  it("does not flip AUTH_INVITE_MODE", () => {
    assert.doesNotMatch(
      read("scripts/seed-hr-permission-catalog.ts"),
      /AUTH_INVITE_MODE/,
    );
    assert.doesNotMatch(
      read("src/lib/permissions/hr-codes.ts"),
      /AUTH_INVITE_MODE/,
    );
  });

  it("adds no migration for the HR catalog", () => {
    const migrationsDir = path.join(ROOT, "prisma/migrations");
    const dirs = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    // Existing platform migrations through 0014 must remain present.
    for (const required of [
      "0011_organization_entity_type",
      "0012_platform_role_permissions",
      "0013_system_settings",
      "0014_user_profile_phone",
    ]) {
      assert.ok(dirs.includes(required), `missing migration ${required}`);
    }

    // HR permission catalog is seed-only — must not add its own migration folder.
    const hrCatalogMigration = dirs.find((name) =>
      /hr[-_]?permission|permission[-_]?catalog|hr[-_]?codes/i.test(name),
    );
    assert.equal(
      hrCatalogMigration,
      undefined,
      `HR catalog must not ship its own migration: ${hrCatalogMigration}`,
    );

    for (const dir of dirs) {
      const sqlPath = path.join(migrationsDir, dir, "migration.sql");
      if (!fs.existsSync(sqlPath)) continue;
      assert.doesNotMatch(
        fs.readFileSync(sqlPath, "utf8"),
        /hr\.employee\.read|GOLDENSOFT_HR/,
        `${dir} must not carry the HR permission catalog`,
      );
    }
  });

  it("documents the seed as the migration-free catalog update path", () => {
    assert.match(read("README.md"), /npm run seed:hr-permissions/);
  });
});
