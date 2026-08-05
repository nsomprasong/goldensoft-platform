export const PLATFORM_PERMISSIONS = {
  organizationRead: "platform.organization.read",
  organizationManage: "platform.organization.manage",
  organizationCreate: "platform.organization.create",
  branchRead: "platform.branch.read",
  branchManage: "platform.branch.manage",
  userRead: "platform.user.read",
  userInvite: "platform.user.invite",
  userSuspend: "platform.user.suspend",
  userManage: "platform.user.manage",
  userPasswordReset: "platform.user.password_reset",
  roleRead: "platform.role.read",
  roleManage: "platform.role.manage",
  roleAssign: "platform.role.assign",
  auditRead: "platform.audit.read",
  productRead: "platform.product.read",
  productManage: "platform.product.manage",
  planRead: "platform.plan.read",
  planManage: "platform.plan.manage",
  subscriptionRead: "platform.subscription.read",
  subscriptionManage: "platform.subscription.manage",
  settingsRead: "platform.settings.read",
  settingsManage: "platform.settings.manage",
  billingAccountRead: "billing.account.read",
  billingAccountManage: "billing.account.manage",
  billingCreditRead: "billing.credit.read",
  billingCreditAdjust: "billing.credit.adjust",
  billingInvoiceRead: "billing.invoice.read",
  billingInvoiceManage: "billing.invoice.manage",
  billingPaymentRead: "billing.payment.read",
  billingPaymentRecord: "billing.payment.record",
  billingContactRead: "billing.contact.read",
  billingContactManage: "billing.contact.manage",
  billingSubscriptionRead: "billing.subscription.read",
  billingSubscriptionManage: "billing.subscription.manage",
  customerPortfolioManage: "platform.customer_portfolio.manage",
  customerAssignmentManage: "customer_assignment.manage",
  customerAssignmentTransfer: "customer_assignment.transfer",
} as const;

export type PlatformPermission =
  (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

/**
 * Permissions that may be granted on organization roles (OWNER/ADMIN/custom).
 * Excludes GoldenSoft staff-only capabilities (create orgs, manage product catalog,
 * platform settings, customer portfolio assignment, etc.).
 */
export const ORGANIZATION_ASSIGNABLE_PERMISSIONS: readonly PlatformPermission[] = [
  PLATFORM_PERMISSIONS.organizationRead,
  PLATFORM_PERMISSIONS.organizationManage,
  PLATFORM_PERMISSIONS.branchRead,
  PLATFORM_PERMISSIONS.branchManage,
  PLATFORM_PERMISSIONS.userRead,
  PLATFORM_PERMISSIONS.userInvite,
  PLATFORM_PERMISSIONS.userSuspend,
  PLATFORM_PERMISSIONS.userManage,
  PLATFORM_PERMISSIONS.userPasswordReset,
  PLATFORM_PERMISSIONS.roleRead,
  PLATFORM_PERMISSIONS.roleManage,
  PLATFORM_PERMISSIONS.roleAssign,
  PLATFORM_PERMISSIONS.auditRead,
  PLATFORM_PERMISSIONS.productRead,
  PLATFORM_PERMISSIONS.planRead,
  PLATFORM_PERMISSIONS.subscriptionRead,
] as const;

const ORGANIZATION_ASSIGNABLE_SET = new Set<string>(
  ORGANIZATION_ASSIGNABLE_PERMISSIONS,
);

export function isOrganizationAssignablePermission(code: string): boolean {
  return ORGANIZATION_ASSIGNABLE_SET.has(code);
}

export type PermissionScopeCode = "PLATFORM" | "ORGANIZATION" | "BOTH";

/** Runtime-compatible scope metadata while the additive scope column is pending apply. */
export function permissionScopeForCode(code: string): PermissionScopeCode {
  const knownPlatformPermissions = new Set<string>(
    Object.values(PLATFORM_PERMISSIONS),
  );
  if (ORGANIZATION_ASSIGNABLE_SET.has(code)) return "BOTH";
  if (knownPlatformPermissions.has(code)) return "PLATFORM";
  return "ORGANIZATION";
}

export function permissionSupportsScope(
  code: string,
  scope: "platform" | "organization",
): boolean {
  const permissionScope = permissionScopeForCode(code);
  return (
    permissionScope === "BOTH" ||
    (scope === "platform" && permissionScope === "PLATFORM") ||
    (scope === "organization" && permissionScope === "ORGANIZATION")
  );
}

/** Thai labels for permission matrix UI — never show raw codes as primary label. */
export const PLATFORM_PERMISSION_LABELS: Record<PlatformPermission, string> = {
  [PLATFORM_PERMISSIONS.organizationRead]: "ดูข้อมูลองค์กร",
  [PLATFORM_PERMISSIONS.organizationManage]: "จัดการองค์กร",
  [PLATFORM_PERMISSIONS.organizationCreate]: "สร้างองค์กรลูกค้า",
  [PLATFORM_PERMISSIONS.branchRead]: "ดูข้อมูลสาขา",
  [PLATFORM_PERMISSIONS.branchManage]: "จัดการสาขา",
  [PLATFORM_PERMISSIONS.userRead]: "ดูผู้ใช้งาน",
  [PLATFORM_PERMISSIONS.userInvite]: "เชิญผู้ใช้งาน",
  [PLATFORM_PERMISSIONS.userSuspend]: "ระงับผู้ใช้งาน",
  [PLATFORM_PERMISSIONS.userManage]: "จัดการผู้ใช้งาน",
  [PLATFORM_PERMISSIONS.userPasswordReset]: "รีเซ็ตรหัสผ่านผู้ใช้",
  [PLATFORM_PERMISSIONS.roleRead]: "ดูบทบาทและสิทธิ์",
  [PLATFORM_PERMISSIONS.roleManage]: "จัดการบทบาท",
  [PLATFORM_PERMISSIONS.roleAssign]: "กำหนดบทบาท",
  [PLATFORM_PERMISSIONS.auditRead]: "ดูบันทึกกิจกรรม",
  [PLATFORM_PERMISSIONS.productRead]: "ดูผลิตภัณฑ์",
  [PLATFORM_PERMISSIONS.productManage]: "จัดการผลิตภัณฑ์",
  [PLATFORM_PERMISSIONS.planRead]: "ดูแพ็กเกจ",
  [PLATFORM_PERMISSIONS.planManage]: "จัดการแพ็กเกจ",
  [PLATFORM_PERMISSIONS.subscriptionRead]: "ดูการสมัครใช้บริการ",
  [PLATFORM_PERMISSIONS.subscriptionManage]: "จัดการการสมัครใช้บริการ",
  [PLATFORM_PERMISSIONS.settingsRead]: "ดูการตั้งค่าระบบ",
  [PLATFORM_PERMISSIONS.settingsManage]: "จัดการการตั้งค่าระบบ",
  [PLATFORM_PERMISSIONS.billingAccountRead]: "ดูบัญชีการเงิน",
  [PLATFORM_PERMISSIONS.billingAccountManage]: "จัดการบัญชีการเงิน",
  [PLATFORM_PERMISSIONS.billingCreditRead]: "ดูเครดิต",
  [PLATFORM_PERMISSIONS.billingCreditAdjust]: "ปรับเครดิต",
  [PLATFORM_PERMISSIONS.billingInvoiceRead]: "ดูใบแจ้งหนี้",
  [PLATFORM_PERMISSIONS.billingInvoiceManage]: "จัดการใบแจ้งหนี้",
  [PLATFORM_PERMISSIONS.billingPaymentRead]: "ดูการชำระเงิน",
  [PLATFORM_PERMISSIONS.billingPaymentRecord]: "บันทึกการชำระเงิน",
  [PLATFORM_PERMISSIONS.billingContactRead]: "ดูผู้ติดต่อการเงิน",
  [PLATFORM_PERMISSIONS.billingContactManage]: "จัดการผู้ติดต่อการเงิน",
  [PLATFORM_PERMISSIONS.billingSubscriptionRead]: "ดูสรุปแพ็กเกจ/การสมัคร",
  [PLATFORM_PERMISSIONS.billingSubscriptionManage]: "จัดการแพ็กเกจด้านการเงิน",
  [PLATFORM_PERMISSIONS.customerPortfolioManage]: "จัดการพอร์ตโฟลิโอลูกค้า",
  [PLATFORM_PERMISSIONS.customerAssignmentManage]: "จัดการผู้รับผิดชอบองค์กรลูกค้า",
  [PLATFORM_PERMISSIONS.customerAssignmentTransfer]: "โอนผู้รับผิดชอบหลัก",
};

export const PLATFORM_PERMISSION_DESCRIPTIONS: Record<
  PlatformPermission,
  string
> = {
  [PLATFORM_PERMISSIONS.organizationRead]: "ดูรายการและรายละเอียดองค์กร",
  [PLATFORM_PERMISSIONS.organizationManage]: "สร้าง แก้ไข และระงับองค์กร",
  [PLATFORM_PERMISSIONS.organizationCreate]:
    "สร้างองค์กรลูกค้าใหม่ พร้อมผูกกับพนักงานขายผู้สร้าง",
  [PLATFORM_PERMISSIONS.branchRead]: "ดูรายการและรายละเอียดสาขา",
  [PLATFORM_PERMISSIONS.branchManage]: "สร้าง แก้ไข และระงับสาขา",
  [PLATFORM_PERMISSIONS.userRead]: "ดูสมาชิกและคำเชิญ",
  [PLATFORM_PERMISSIONS.userInvite]: "ส่งคำเชิญเข้าองค์กร",
  [PLATFORM_PERMISSIONS.userSuspend]: "ระงับการเข้าถึงของผู้ใช้",
  [PLATFORM_PERMISSIONS.userManage]: "แก้ไขสถานะและข้อมูลสมาชิก",
  [PLATFORM_PERMISSIONS.userPasswordReset]:
    "เปิดสิทธิ์ให้ผู้ใช้ตั้งรหัสผ่านใหม่ด้วยตนเอง โดยผู้ดูแลไม่ทราบรหัสผ่าน",
  [PLATFORM_PERMISSIONS.roleRead]: "ดูบทบาทและเมทริกซ์สิทธิ์",
  [PLATFORM_PERMISSIONS.roleManage]: "สร้างและแก้ไขบทบาทกำหนดเอง",
  [PLATFORM_PERMISSIONS.roleAssign]: "กำหนดหรือถอดบทบาทจากผู้ใช้",
  [PLATFORM_PERMISSIONS.auditRead]: "ดูประวัติการเปลี่ยนแปลง",
  [PLATFORM_PERMISSIONS.productRead]: "ดูรายการผลิตภัณฑ์",
  [PLATFORM_PERMISSIONS.productManage]: "สร้างและแก้ไขผลิตภัณฑ์",
  [PLATFORM_PERMISSIONS.planRead]: "ดูแพ็กเกจและเวอร์ชัน",
  [PLATFORM_PERMISSIONS.planManage]: "สร้างและแก้ไขแพ็กเกจ",
  [PLATFORM_PERMISSIONS.subscriptionRead]: "ดูรายการการสมัคร",
  [PLATFORM_PERMISSIONS.subscriptionManage]:
    "สร้าง เปลี่ยนสถานะ และเปลี่ยนแพ็กเกจ",
  [PLATFORM_PERMISSIONS.settingsRead]: "ดูการตั้งค่าแพลตฟอร์ม",
  [PLATFORM_PERMISSIONS.settingsManage]: "แก้ไขค่าเริ่มต้นของแพลตฟอร์ม",
  [PLATFORM_PERMISSIONS.billingAccountRead]: "ดูบัญชีการเงินขององค์กร",
  [PLATFORM_PERMISSIONS.billingAccountManage]: "สร้างและจัดการบัญชีการเงิน",
  [PLATFORM_PERMISSIONS.billingCreditRead]: "ดูยอดและประวัติเครดิต",
  [PLATFORM_PERMISSIONS.billingCreditAdjust]: "บันทึกปรับปรุงเครดิต",
  [PLATFORM_PERMISSIONS.billingInvoiceRead]: "ดูใบแจ้งหนี้",
  [PLATFORM_PERMISSIONS.billingInvoiceManage]: "สร้าง ออก และโมฆะใบแจ้งหนี้",
  [PLATFORM_PERMISSIONS.billingPaymentRead]: "ดูรายการชำระเงิน",
  [PLATFORM_PERMISSIONS.billingPaymentRecord]:
    "บันทึกและยืนยันการชำระเงินแบบมือ",
  [PLATFORM_PERMISSIONS.billingContactRead]: "ดูผู้ติดต่อการเงิน",
  [PLATFORM_PERMISSIONS.billingContactManage]: "สร้างและแก้ไขผู้ติดต่อการเงิน",
  [PLATFORM_PERMISSIONS.billingSubscriptionRead]:
    "ดูสรุปแพ็กเกจและวันหมดอายุ",
  [PLATFORM_PERMISSIONS.billingSubscriptionManage]:
    "จัดการมุมมองแพ็กเกจด้านการเงิน",
  [PLATFORM_PERMISSIONS.customerPortfolioManage]:
    "กำหนดหรือถอดองค์กรลูกค้าให้พนักงานขาย/ผู้ดูแลบัญชีลูกค้า",
  [PLATFORM_PERMISSIONS.customerAssignmentManage]:
    "เพิ่มหรือถอนผู้รับผิดชอบองค์กรลูกค้าโดยตรวจสอบขอบเขตทุกครั้ง",
  [PLATFORM_PERMISSIONS.customerAssignmentTransfer]:
    "โอนความรับผิดชอบหลักไปยังพนักงาน GoldenSoft คนอื่น",
};

const ALL_BILLING_PERMISSIONS: PlatformPermission[] = [
  PLATFORM_PERMISSIONS.billingAccountRead,
  PLATFORM_PERMISSIONS.billingAccountManage,
  PLATFORM_PERMISSIONS.billingCreditRead,
  PLATFORM_PERMISSIONS.billingCreditAdjust,
  PLATFORM_PERMISSIONS.billingInvoiceRead,
  PLATFORM_PERMISSIONS.billingInvoiceManage,
  PLATFORM_PERMISSIONS.billingPaymentRead,
  PLATFORM_PERMISSIONS.billingPaymentRecord,
  PLATFORM_PERMISSIONS.billingContactRead,
  PLATFORM_PERMISSIONS.billingContactManage,
  PLATFORM_PERMISSIONS.billingSubscriptionRead,
  PLATFORM_PERMISSIONS.billingSubscriptionManage,
];

export function permissionResourceGroup(code: string): string {
  const parts = code.split(".");
  if (parts[0] === "billing" && parts.length >= 2) return "billing";
  return parts.length >= 2 ? parts[1]! : "other";
}

/** Default grants for system organization roles (used until DB overrides exist). */
export function defaultPermissionsForOrganizationRole(
  roleCode: string,
): PlatformPermission[] {
  if (roleCode === "OWNER") {
    return [
      PLATFORM_PERMISSIONS.organizationRead,
      PLATFORM_PERMISSIONS.organizationManage,
      PLATFORM_PERMISSIONS.branchRead,
      PLATFORM_PERMISSIONS.branchManage,
      PLATFORM_PERMISSIONS.userRead,
      PLATFORM_PERMISSIONS.userInvite,
      PLATFORM_PERMISSIONS.userSuspend,
      PLATFORM_PERMISSIONS.userManage,
      PLATFORM_PERMISSIONS.roleRead,
      PLATFORM_PERMISSIONS.roleManage,
      PLATFORM_PERMISSIONS.roleAssign,
      PLATFORM_PERMISSIONS.productRead,
      PLATFORM_PERMISSIONS.planRead,
      PLATFORM_PERMISSIONS.subscriptionRead,
      PLATFORM_PERMISSIONS.auditRead,
      // Account/subscription summary only — no credit/invoice/payment by default.
      PLATFORM_PERMISSIONS.billingSubscriptionRead,
    ];
  }
  if (roleCode === "ADMIN") {
    return [
      PLATFORM_PERMISSIONS.organizationRead,
      PLATFORM_PERMISSIONS.branchRead,
      PLATFORM_PERMISSIONS.branchManage,
      PLATFORM_PERMISSIONS.userRead,
      PLATFORM_PERMISSIONS.userInvite,
      PLATFORM_PERMISSIONS.userSuspend,
      PLATFORM_PERMISSIONS.userManage,
      PLATFORM_PERMISSIONS.roleRead,
      PLATFORM_PERMISSIONS.productRead,
      PLATFORM_PERMISSIONS.planRead,
      PLATFORM_PERMISSIONS.subscriptionRead,
      PLATFORM_PERMISSIONS.auditRead,
      // ADMIN does not receive billing permissions by default.
    ];
  }
  if (roleCode === "BILLING_CONTACT") {
    return [
      PLATFORM_PERMISSIONS.organizationRead,
      PLATFORM_PERMISSIONS.subscriptionRead,
      PLATFORM_PERMISSIONS.productRead,
      PLATFORM_PERMISSIONS.planRead,
      PLATFORM_PERMISSIONS.billingAccountRead,
      PLATFORM_PERMISSIONS.billingCreditRead,
      PLATFORM_PERMISSIONS.billingInvoiceRead,
      PLATFORM_PERMISSIONS.billingPaymentRead,
      PLATFORM_PERMISSIONS.billingContactRead,
      PLATFORM_PERMISSIONS.billingContactManage,
      PLATFORM_PERMISSIONS.billingSubscriptionRead,
      // Commercial subscription lifecycle stays on OWNER/BILLING_ADMIN.
    ];
  }
  if (roleCode === "BRANCH_MANAGER") {
    return [
      PLATFORM_PERMISSIONS.organizationRead,
      PLATFORM_PERMISSIONS.branchRead,
      PLATFORM_PERMISSIONS.userRead,
    ];
  }
  return [];
}

/** Default grants for platform staff roles (used until DB overrides exist). */
export function defaultPermissionsForPlatformRole(
  roleCode: string,
): PlatformPermission[] {
  if (roleCode === "SUPER_ADMIN") {
    return Object.values(PLATFORM_PERMISSIONS);
  }
  if (roleCode === "BILLING_ADMIN") {
    return [
      PLATFORM_PERMISSIONS.subscriptionRead,
      PLATFORM_PERMISSIONS.subscriptionManage,
      PLATFORM_PERMISSIONS.organizationRead,
      PLATFORM_PERMISSIONS.productRead,
      PLATFORM_PERMISSIONS.planRead,
      PLATFORM_PERMISSIONS.auditRead,
      ...ALL_BILLING_PERMISSIONS,
    ];
  }
  if (roleCode === "SUPPORT") {
    return [
      PLATFORM_PERMISSIONS.organizationRead,
      PLATFORM_PERMISSIONS.branchRead,
      PLATFORM_PERMISSIONS.userRead,
      PLATFORM_PERMISSIONS.productRead,
      PLATFORM_PERMISSIONS.planRead,
      PLATFORM_PERMISSIONS.subscriptionRead,
      PLATFORM_PERMISSIONS.auditRead,
      PLATFORM_PERMISSIONS.billingAccountRead,
      PLATFORM_PERMISSIONS.billingSubscriptionRead,
    ];
  }
  // SALES / ACCOUNT_MANAGER: portfolio-scoped at runtime (managed orgs only).
  // Closest to customer OWNER for assigned orgs: read/edit org + branches + users.
  if (roleCode === "SALES" || roleCode === "ACCOUNT_MANAGER") {
    return [
      PLATFORM_PERMISSIONS.organizationRead,
      PLATFORM_PERMISSIONS.organizationCreate,
      PLATFORM_PERMISSIONS.organizationManage,
      PLATFORM_PERMISSIONS.branchRead,
      PLATFORM_PERMISSIONS.branchManage,
      PLATFORM_PERMISSIONS.userRead,
      PLATFORM_PERMISSIONS.userInvite,
      PLATFORM_PERMISSIONS.userManage,
      PLATFORM_PERMISSIONS.roleRead,
      PLATFORM_PERMISSIONS.roleManage,
      PLATFORM_PERMISSIONS.roleAssign,
      PLATFORM_PERMISSIONS.productRead,
      PLATFORM_PERMISSIONS.planRead,
      PLATFORM_PERMISSIONS.subscriptionRead,
    ];
  }
  return [];
}

export function permissionsForRoles(input: {
  platformRoles: string[];
  organizationRoles: string[];
  /** Extra permission codes from custom org roles (already resolved). */
  customPermissionCodes?: string[];
  /**
   * Optional DB overrides for system organization roles.
   * When a role code is present (even as []), use it instead of defaults.
   */
  organizationRolePermissionOverrides?: Record<string, string[]>;
  /** Optional DB overrides for platform staff roles (except SUPER_ADMIN). */
  platformRolePermissionOverrides?: Record<string, string[]>;
}): string[] {
  const set = new Set<string>();
  const platformOverrides = input.platformRolePermissionOverrides;

  for (const roleCode of input.platformRoles) {
    // SUPER_ADMIN always retains full access — cannot be locked out via DB edits.
    if (roleCode === "SUPER_ADMIN") {
      Object.values(PLATFORM_PERMISSIONS).forEach((p) => set.add(p));
      continue;
    }
    if (
      platformOverrides &&
      Object.prototype.hasOwnProperty.call(platformOverrides, roleCode)
    ) {
      for (const code of platformOverrides[roleCode] ?? []) set.add(code);
      continue;
    }
    for (const code of defaultPermissionsForPlatformRole(roleCode)) {
      set.add(code);
    }
  }

  const overrides = input.organizationRolePermissionOverrides;
  for (const roleCode of input.organizationRoles) {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, roleCode)) {
      for (const code of overrides[roleCode] ?? []) set.add(code);
      continue;
    }
    for (const code of defaultPermissionsForOrganizationRole(roleCode)) {
      set.add(code);
    }
  }

  for (const code of input.customPermissionCodes ?? []) {
    set.add(code);
  }

  return [...set].sort();
}

export function hasPermissionCode(
  permissions: string[],
  permission: PlatformPermission,
): boolean {
  return permissions.includes(permission);
}
