/**
 * HR (GOLDENSOFT_HR) permission catalog.
 *
 * Rows live in `platform.permissions` and are published with the system seed
 * (`npm run seed:hr-permissions`) — never with a migration, because the
 * additive migration check requires DDL and rejects INSERT-only SQL.
 */
export const HR_PRODUCT_CODE = "GOLDENSOFT_HR";

export const HR_PERMISSIONS = {
  employeeRead: "hr.employee.read",
  employeeCreate: "hr.employee.create",
  employeeUpdate: "hr.employee.update",
  employeeDeactivate: "hr.employee.deactivate",
  employeeLinkUser: "hr.employee.link_user",
  compensationRead: "hr.compensation.read",
  compensationManage: "hr.compensation.manage",
  departmentManage: "hr.department.manage",
  positionManage: "hr.position.manage",
  shiftRead: "hr.shift.read",
  shiftManage: "hr.shift.manage",
  payrollScheduleRead: "hr.payroll_schedule.read",
  payrollScheduleManage: "hr.payroll_schedule.manage",
  payrollPeriodRead: "hr.payroll_period.read",
  payrollPeriodManage: "hr.payroll_period.manage",
  settingsManage: "hr.settings.manage",
} as const;

export type HrPermission = (typeof HR_PERMISSIONS)[keyof typeof HR_PERMISSIONS];

/** Thai labels for permission matrix UI — never show raw codes as primary label. */
export const HR_PERMISSION_LABELS: Record<HrPermission, string> = {
  [HR_PERMISSIONS.employeeRead]: "ดูพนักงาน",
  [HR_PERMISSIONS.employeeCreate]: "สร้างพนักงาน",
  [HR_PERMISSIONS.employeeUpdate]: "แก้ไขพนักงาน",
  [HR_PERMISSIONS.employeeDeactivate]: "ปิดใช้งานพนักงาน",
  [HR_PERMISSIONS.employeeLinkUser]: "ผูกผู้ใช้ Platform",
  [HR_PERMISSIONS.compensationRead]: "ดูค่าจ้าง",
  [HR_PERMISSIONS.compensationManage]: "จัดการค่าจ้าง",
  [HR_PERMISSIONS.departmentManage]: "จัดการแผนก",
  [HR_PERMISSIONS.positionManage]: "จัดการตำแหน่ง",
  [HR_PERMISSIONS.shiftRead]: "ดูกะงาน",
  [HR_PERMISSIONS.shiftManage]: "จัดการกะงาน",
  [HR_PERMISSIONS.payrollScheduleRead]: "ดูรอบจ่าย",
  [HR_PERMISSIONS.payrollScheduleManage]: "จัดการรอบจ่าย",
  [HR_PERMISSIONS.payrollPeriodRead]: "ดูงวดเงินเดือน",
  [HR_PERMISSIONS.payrollPeriodManage]: "จัดการงวดเงินเดือน",
  [HR_PERMISSIONS.settingsManage]: "จัดการตั้งค่า HR",
};

export const HR_PERMISSION_LABELS_EN: Record<HrPermission, string> = {
  [HR_PERMISSIONS.employeeRead]: "View employees",
  [HR_PERMISSIONS.employeeCreate]: "Create employee",
  [HR_PERMISSIONS.employeeUpdate]: "Update employee",
  [HR_PERMISSIONS.employeeDeactivate]: "Deactivate employee",
  [HR_PERMISSIONS.employeeLinkUser]: "Link platform user",
  [HR_PERMISSIONS.compensationRead]: "View compensation",
  [HR_PERMISSIONS.compensationManage]: "Manage compensation",
  [HR_PERMISSIONS.departmentManage]: "Manage departments",
  [HR_PERMISSIONS.positionManage]: "Manage positions",
  [HR_PERMISSIONS.shiftRead]: "View shifts",
  [HR_PERMISSIONS.shiftManage]: "Manage shifts",
  [HR_PERMISSIONS.payrollScheduleRead]: "View payroll schedules",
  [HR_PERMISSIONS.payrollScheduleManage]: "Manage payroll schedules",
  [HR_PERMISSIONS.payrollPeriodRead]: "View payroll periods",
  [HR_PERMISSIONS.payrollPeriodManage]: "Manage payroll periods",
  [HR_PERMISSIONS.settingsManage]: "Manage HR settings",
};

export type HrPermissionCatalogEntry = {
  code: HrPermission;
  nameTh: string;
  nameEn: string;
  productCode: typeof HR_PRODUCT_CODE;
  resource: string;
  action: string;
  sortOrder: number;
};

const RESOURCE_ACTION: Record<HrPermission, { resource: string; action: string }> =
  {
    [HR_PERMISSIONS.employeeRead]: { resource: "employee", action: "read" },
    [HR_PERMISSIONS.employeeCreate]: { resource: "employee", action: "create" },
    [HR_PERMISSIONS.employeeUpdate]: { resource: "employee", action: "update" },
    [HR_PERMISSIONS.employeeDeactivate]: {
      resource: "employee",
      action: "deactivate",
    },
    [HR_PERMISSIONS.employeeLinkUser]: {
      resource: "employee",
      action: "link_user",
    },
    [HR_PERMISSIONS.compensationRead]: {
      resource: "compensation",
      action: "read",
    },
    [HR_PERMISSIONS.compensationManage]: {
      resource: "compensation",
      action: "manage",
    },
    [HR_PERMISSIONS.departmentManage]: {
      resource: "department",
      action: "manage",
    },
    [HR_PERMISSIONS.positionManage]: { resource: "position", action: "manage" },
    [HR_PERMISSIONS.shiftRead]: { resource: "shift", action: "read" },
    [HR_PERMISSIONS.shiftManage]: { resource: "shift", action: "manage" },
    [HR_PERMISSIONS.payrollScheduleRead]: {
      resource: "payroll_schedule",
      action: "read",
    },
    [HR_PERMISSIONS.payrollScheduleManage]: {
      resource: "payroll_schedule",
      action: "manage",
    },
    [HR_PERMISSIONS.payrollPeriodRead]: {
      resource: "payroll_period",
      action: "read",
    },
    [HR_PERMISSIONS.payrollPeriodManage]: {
      resource: "payroll_period",
      action: "manage",
    },
    [HR_PERMISSIONS.settingsManage]: { resource: "settings", action: "manage" },
  };

/** Ordered rows consumed by the HR permission catalog seed (upsert by code). */
export const HR_PERMISSION_CATALOG: HrPermissionCatalogEntry[] = Object.values(
  HR_PERMISSIONS,
).map((code, index) => ({
  code,
  nameTh: HR_PERMISSION_LABELS[code],
  nameEn: HR_PERMISSION_LABELS_EN[code],
  productCode: HR_PRODUCT_CODE,
  resource: RESOURCE_ACTION[code].resource,
  action: RESOURCE_ACTION[code].action,
  sortOrder: index + 1,
}));

export const HR_PERMISSION_CODES: HrPermission[] = HR_PERMISSION_CATALOG.map(
  (entry) => entry.code,
);

export function isHrPermissionCode(code: string): code is HrPermission {
  return (HR_PERMISSION_CODES as string[]).includes(code);
}

export function hrPermissionLabel(code: string): string {
  return isHrPermissionCode(code) ? HR_PERMISSION_LABELS[code] : code;
}
