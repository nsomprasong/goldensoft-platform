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
  scheduleRead: "hr.schedule.read",
  scheduleManage: "hr.schedule.manage",
  schedulePublish: "hr.schedule.publish",
  attendanceSelf: "hr.attendance.self",
  attendanceRead: "hr.attendance.read",
  attendanceManage: "hr.attendance.manage",
  attendanceOverride: "hr.attendance.override",
  leaveSelf: "hr.leave.self",
  leaveRead: "hr.leave.read",
  leaveManage: "hr.leave.manage",
  leaveApprove: "hr.leave.approve",
  overtimeSelf: "hr.overtime.self",
  overtimeRead: "hr.overtime.read",
  overtimeManage: "hr.overtime.manage",
  overtimeApprove: "hr.overtime.approve",
  compensationRead: "hr.compensation.read",
  compensationManage: "hr.compensation.manage",
  payrollRead: "hr.payroll.read",
  payrollCalculate: "hr.payroll.calculate",
  payrollReview: "hr.payroll.review",
  payrollApprove: "hr.payroll.approve",
  payrollMarkPaid: "hr.payroll.mark_paid",
  payrollLock: "hr.payroll.lock",
  payslipSelf: "hr.payslip.self",
  payslipRead: "hr.payslip.read",
  advanceSelf: "hr.advance.self",
  advanceApprove: "hr.advance.approve",
  departmentManage: "hr.department.manage",
  positionManage: "hr.position.manage",
  shiftRead: "hr.shift.read",
  shiftManage: "hr.shift.manage",
  locationManage: "hr.location.manage",
  calendarManage: "hr.calendar.manage",
  reportRead: "hr.report.read",
  approvalRead: "hr.approval.read",
  approvalManage: "hr.approval.manage",
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
  [HR_PERMISSIONS.scheduleRead]: "ดูตารางงาน",
  [HR_PERMISSIONS.scheduleManage]: "จัดการตารางงาน",
  [HR_PERMISSIONS.schedulePublish]: "เผยแพร่ตารางงาน",
  [HR_PERMISSIONS.attendanceSelf]: "ดูเวลาทำงานของตนเอง",
  [HR_PERMISSIONS.attendanceRead]: "ดูเวลาทำงาน",
  [HR_PERMISSIONS.attendanceManage]: "จัดการเวลาทำงาน",
  [HR_PERMISSIONS.attendanceOverride]: "แก้ไขข้อยกเว้นเวลาทำงาน",
  [HR_PERMISSIONS.leaveSelf]: "จัดการการลาของตนเอง",
  [HR_PERMISSIONS.leaveRead]: "ดูการลา",
  [HR_PERMISSIONS.leaveManage]: "จัดการการลา",
  [HR_PERMISSIONS.leaveApprove]: "อนุมัติการลา",
  [HR_PERMISSIONS.overtimeSelf]: "จัดการ OT ของตนเอง",
  [HR_PERMISSIONS.overtimeRead]: "ดู OT",
  [HR_PERMISSIONS.overtimeManage]: "จัดการ OT",
  [HR_PERMISSIONS.overtimeApprove]: "อนุมัติ OT",
  [HR_PERMISSIONS.compensationRead]: "ดูค่าจ้าง",
  [HR_PERMISSIONS.compensationManage]: "จัดการค่าจ้าง",
  [HR_PERMISSIONS.payrollRead]: "ดูเงินเดือน",
  [HR_PERMISSIONS.payrollCalculate]: "คำนวณเงินเดือน",
  [HR_PERMISSIONS.payrollReview]: "ตรวจสอบเงินเดือน",
  [HR_PERMISSIONS.payrollApprove]: "อนุมัติเงินเดือน",
  [HR_PERMISSIONS.payrollMarkPaid]: "บันทึกว่าจ่ายแล้ว",
  [HR_PERMISSIONS.payrollLock]: "ล็อกงวดเงินเดือน",
  [HR_PERMISSIONS.payslipSelf]: "ดูสลิปเงินเดือนของตนเอง",
  [HR_PERMISSIONS.payslipRead]: "ดูสลิปเงินเดือน",
  [HR_PERMISSIONS.advanceSelf]: "ขอเบิกล่วงหน้าของตนเอง",
  [HR_PERMISSIONS.advanceApprove]: "อนุมัติเบิกล่วงหน้า",
  [HR_PERMISSIONS.departmentManage]: "จัดการแผนก",
  [HR_PERMISSIONS.positionManage]: "จัดการตำแหน่ง",
  [HR_PERMISSIONS.shiftRead]: "ดูกะงาน",
  [HR_PERMISSIONS.shiftManage]: "จัดการกะงาน",
  [HR_PERMISSIONS.locationManage]: "จัดการสถานที่ทำงาน",
  [HR_PERMISSIONS.calendarManage]: "จัดการปฏิทิน",
  [HR_PERMISSIONS.reportRead]: "ดูรายงาน HR",
  [HR_PERMISSIONS.approvalRead]: "ดูรายการอนุมัติ",
  [HR_PERMISSIONS.approvalManage]: "จัดการรายการอนุมัติ",
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
  [HR_PERMISSIONS.scheduleRead]: "View schedules",
  [HR_PERMISSIONS.scheduleManage]: "Manage schedules",
  [HR_PERMISSIONS.schedulePublish]: "Publish schedules",
  [HR_PERMISSIONS.attendanceSelf]: "View own attendance",
  [HR_PERMISSIONS.attendanceRead]: "View attendance",
  [HR_PERMISSIONS.attendanceManage]: "Manage attendance",
  [HR_PERMISSIONS.attendanceOverride]: "Override attendance",
  [HR_PERMISSIONS.leaveSelf]: "Manage own leave",
  [HR_PERMISSIONS.leaveRead]: "View leave",
  [HR_PERMISSIONS.leaveManage]: "Manage leave",
  [HR_PERMISSIONS.leaveApprove]: "Approve leave",
  [HR_PERMISSIONS.overtimeSelf]: "Manage own overtime",
  [HR_PERMISSIONS.overtimeRead]: "View overtime",
  [HR_PERMISSIONS.overtimeManage]: "Manage overtime",
  [HR_PERMISSIONS.overtimeApprove]: "Approve overtime",
  [HR_PERMISSIONS.compensationRead]: "View compensation",
  [HR_PERMISSIONS.compensationManage]: "Manage compensation",
  [HR_PERMISSIONS.payrollRead]: "View payroll",
  [HR_PERMISSIONS.payrollCalculate]: "Calculate payroll",
  [HR_PERMISSIONS.payrollReview]: "Review payroll",
  [HR_PERMISSIONS.payrollApprove]: "Approve payroll",
  [HR_PERMISSIONS.payrollMarkPaid]: "Mark payroll paid",
  [HR_PERMISSIONS.payrollLock]: "Lock payroll",
  [HR_PERMISSIONS.payslipSelf]: "View own payslips",
  [HR_PERMISSIONS.payslipRead]: "View payslips",
  [HR_PERMISSIONS.advanceSelf]: "Request own salary advance",
  [HR_PERMISSIONS.advanceApprove]: "Approve salary advances",
  [HR_PERMISSIONS.departmentManage]: "Manage departments",
  [HR_PERMISSIONS.positionManage]: "Manage positions",
  [HR_PERMISSIONS.shiftRead]: "View shifts",
  [HR_PERMISSIONS.shiftManage]: "Manage shifts",
  [HR_PERMISSIONS.locationManage]: "Manage work locations",
  [HR_PERMISSIONS.calendarManage]: "Manage calendars",
  [HR_PERMISSIONS.reportRead]: "View HR reports",
  [HR_PERMISSIONS.approvalRead]: "View approvals",
  [HR_PERMISSIONS.approvalManage]: "Manage approvals",
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
    [HR_PERMISSIONS.scheduleRead]: { resource: "schedule", action: "read" },
    [HR_PERMISSIONS.scheduleManage]: { resource: "schedule", action: "manage" },
    [HR_PERMISSIONS.schedulePublish]: {
      resource: "schedule",
      action: "publish",
    },
    [HR_PERMISSIONS.attendanceSelf]: { resource: "attendance", action: "self" },
    [HR_PERMISSIONS.attendanceRead]: { resource: "attendance", action: "read" },
    [HR_PERMISSIONS.attendanceManage]: {
      resource: "attendance",
      action: "manage",
    },
    [HR_PERMISSIONS.attendanceOverride]: {
      resource: "attendance",
      action: "override",
    },
    [HR_PERMISSIONS.leaveSelf]: { resource: "leave", action: "self" },
    [HR_PERMISSIONS.leaveRead]: { resource: "leave", action: "read" },
    [HR_PERMISSIONS.leaveManage]: { resource: "leave", action: "manage" },
    [HR_PERMISSIONS.leaveApprove]: { resource: "leave", action: "approve" },
    [HR_PERMISSIONS.overtimeSelf]: { resource: "overtime", action: "self" },
    [HR_PERMISSIONS.overtimeRead]: { resource: "overtime", action: "read" },
    [HR_PERMISSIONS.overtimeManage]: {
      resource: "overtime",
      action: "manage",
    },
    [HR_PERMISSIONS.overtimeApprove]: {
      resource: "overtime",
      action: "approve",
    },
    [HR_PERMISSIONS.compensationRead]: {
      resource: "compensation",
      action: "read",
    },
    [HR_PERMISSIONS.compensationManage]: {
      resource: "compensation",
      action: "manage",
    },
    [HR_PERMISSIONS.payrollRead]: { resource: "payroll", action: "read" },
    [HR_PERMISSIONS.payrollCalculate]: {
      resource: "payroll",
      action: "calculate",
    },
    [HR_PERMISSIONS.payrollReview]: { resource: "payroll", action: "review" },
    [HR_PERMISSIONS.payrollApprove]: {
      resource: "payroll",
      action: "approve",
    },
    [HR_PERMISSIONS.payrollMarkPaid]: {
      resource: "payroll",
      action: "mark_paid",
    },
    [HR_PERMISSIONS.payrollLock]: { resource: "payroll", action: "lock" },
    [HR_PERMISSIONS.payslipSelf]: { resource: "payslip", action: "self" },
    [HR_PERMISSIONS.payslipRead]: { resource: "payslip", action: "read" },
    [HR_PERMISSIONS.advanceSelf]: { resource: "advance", action: "self" },
    [HR_PERMISSIONS.advanceApprove]: { resource: "advance", action: "approve" },
    [HR_PERMISSIONS.departmentManage]: {
      resource: "department",
      action: "manage",
    },
    [HR_PERMISSIONS.positionManage]: { resource: "position", action: "manage" },
    [HR_PERMISSIONS.shiftRead]: { resource: "shift", action: "read" },
    [HR_PERMISSIONS.shiftManage]: { resource: "shift", action: "manage" },
    [HR_PERMISSIONS.locationManage]: {
      resource: "location",
      action: "manage",
    },
    [HR_PERMISSIONS.calendarManage]: {
      resource: "calendar",
      action: "manage",
    },
    [HR_PERMISSIONS.reportRead]: { resource: "report", action: "read" },
    [HR_PERMISSIONS.approvalRead]: { resource: "approval", action: "read" },
    [HR_PERMISSIONS.approvalManage]: {
      resource: "approval",
      action: "manage",
    },
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

/**
 * Self-service set for ordinary org members (not OWNER/ADMIN).
 * Mirrors goldensoft-hr `MEMBER_PERMISSIONS` so Customer App menus appear.
 */
export const HR_MEMBER_PERMISSION_CODES: readonly HrPermission[] = [
  HR_PERMISSIONS.scheduleRead,
  HR_PERMISSIONS.attendanceSelf,
  HR_PERMISSIONS.leaveSelf,
  HR_PERMISSIONS.overtimeSelf,
  HR_PERMISSIONS.payslipSelf,
  HR_PERMISSIONS.advanceSelf,
];

/**
 * Branch manager: self-service + approve/read within their SELECTED branch.
 * Does not receive org-wide settings, payroll, or employee admin catalog.
 */
export const HR_BRANCH_MANAGER_PERMISSION_CODES: readonly HrPermission[] = [
  ...HR_MEMBER_PERMISSION_CODES,
  HR_PERMISSIONS.approvalRead,
  HR_PERMISSIONS.leaveRead,
  HR_PERMISSIONS.leaveApprove,
  HR_PERMISSIONS.overtimeRead,
  HR_PERMISSIONS.overtimeApprove,
  HR_PERMISSIONS.advanceApprove,
  HR_PERMISSIONS.attendanceRead,
  HR_PERMISSIONS.attendanceManage,
];

export function isHrPermissionCode(code: string): code is HrPermission {
  return (HR_PERMISSION_CODES as string[]).includes(code);
}

export function hrPermissionLabel(code: string): string {
  return isHrPermissionCode(code) ? HR_PERMISSION_LABELS[code] : code;
}
