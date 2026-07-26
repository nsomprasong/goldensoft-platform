export const PLATFORM_PERMISSIONS = {
  organizationRead: "platform.organization.read",
  organizationManage: "platform.organization.manage",
  branchRead: "platform.branch.read",
  branchManage: "platform.branch.manage",
  userRead: "platform.user.read",
  userInvite: "platform.user.invite",
  userSuspend: "platform.user.suspend",
  userManage: "platform.user.manage",
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
} as const;

export type PlatformPermission =
  (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

/** Thai labels for permission matrix UI — never show raw codes as primary label. */
export const PLATFORM_PERMISSION_LABELS: Record<PlatformPermission, string> = {
  [PLATFORM_PERMISSIONS.organizationRead]: "ดูข้อมูลองค์กร",
  [PLATFORM_PERMISSIONS.organizationManage]: "จัดการองค์กร",
  [PLATFORM_PERMISSIONS.branchRead]: "ดูข้อมูลสาขา",
  [PLATFORM_PERMISSIONS.branchManage]: "จัดการสาขา",
  [PLATFORM_PERMISSIONS.userRead]: "ดูผู้ใช้งาน",
  [PLATFORM_PERMISSIONS.userInvite]: "เชิญผู้ใช้งาน",
  [PLATFORM_PERMISSIONS.userSuspend]: "ระงับผู้ใช้งาน",
  [PLATFORM_PERMISSIONS.userManage]: "จัดการผู้ใช้งาน",
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
};

export const PLATFORM_PERMISSION_DESCRIPTIONS: Record<
  PlatformPermission,
  string
> = {
  [PLATFORM_PERMISSIONS.organizationRead]: "ดูรายการและรายละเอียดองค์กร",
  [PLATFORM_PERMISSIONS.organizationManage]: "สร้าง แก้ไข และระงับองค์กร",
  [PLATFORM_PERMISSIONS.branchRead]: "ดูรายการและรายละเอียดสาขา",
  [PLATFORM_PERMISSIONS.branchManage]: "สร้าง แก้ไข และระงับสาขา",
  [PLATFORM_PERMISSIONS.userRead]: "ดูสมาชิกและคำเชิญ",
  [PLATFORM_PERMISSIONS.userInvite]: "ส่งคำเชิญเข้าองค์กร",
  [PLATFORM_PERMISSIONS.userSuspend]: "ระงับการเข้าถึงของผู้ใช้",
  [PLATFORM_PERMISSIONS.userManage]: "แก้ไขสถานะและข้อมูลสมาชิก",
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

export function permissionsForRoles(input: {
  platformRoles: string[];
  organizationRoles: string[];
  /** Extra permission codes from custom org roles (already resolved). */
  customPermissionCodes?: string[];
}): string[] {
  const set = new Set<string>();

  if (input.platformRoles.includes("SUPER_ADMIN")) {
    Object.values(PLATFORM_PERMISSIONS).forEach((p) => set.add(p));
  }
  if (input.platformRoles.includes("BILLING_ADMIN")) {
    set.add(PLATFORM_PERMISSIONS.subscriptionRead);
    set.add(PLATFORM_PERMISSIONS.subscriptionManage);
    set.add(PLATFORM_PERMISSIONS.organizationRead);
    set.add(PLATFORM_PERMISSIONS.productRead);
    set.add(PLATFORM_PERMISSIONS.planRead);
    set.add(PLATFORM_PERMISSIONS.auditRead);
    for (const code of ALL_BILLING_PERMISSIONS) set.add(code);
  }
  if (input.platformRoles.includes("SUPPORT")) {
    set.add(PLATFORM_PERMISSIONS.organizationRead);
    set.add(PLATFORM_PERMISSIONS.branchRead);
    set.add(PLATFORM_PERMISSIONS.userRead);
    set.add(PLATFORM_PERMISSIONS.productRead);
    set.add(PLATFORM_PERMISSIONS.planRead);
    set.add(PLATFORM_PERMISSIONS.subscriptionRead);
    set.add(PLATFORM_PERMISSIONS.auditRead);
    set.add(PLATFORM_PERMISSIONS.billingAccountRead);
    set.add(PLATFORM_PERMISSIONS.billingSubscriptionRead);
  }

  // SALES / ACCOUNT_MANAGER: static, read-mostly access scoped at runtime to
  // their assigned customer-portfolio organizations (see
  // src/lib/platform/customer-portfolio.ts). No billing/commission access —
  // commission is out of scope for this phase.
  if (
    input.platformRoles.includes("SALES") ||
    input.platformRoles.includes("ACCOUNT_MANAGER")
  ) {
    set.add(PLATFORM_PERMISSIONS.organizationRead);
    set.add(PLATFORM_PERMISSIONS.branchRead);
    set.add(PLATFORM_PERMISSIONS.userRead);
    set.add(PLATFORM_PERMISSIONS.userInvite);
    set.add(PLATFORM_PERMISSIONS.userManage);
    set.add(PLATFORM_PERMISSIONS.roleRead);
    set.add(PLATFORM_PERMISSIONS.roleManage);
    set.add(PLATFORM_PERMISSIONS.roleAssign);
    set.add(PLATFORM_PERMISSIONS.productRead);
  }

  if (input.organizationRoles.includes("OWNER")) {
    set.add(PLATFORM_PERMISSIONS.organizationRead);
    set.add(PLATFORM_PERMISSIONS.organizationManage);
    set.add(PLATFORM_PERMISSIONS.branchRead);
    set.add(PLATFORM_PERMISSIONS.branchManage);
    set.add(PLATFORM_PERMISSIONS.userRead);
    set.add(PLATFORM_PERMISSIONS.userInvite);
    set.add(PLATFORM_PERMISSIONS.userSuspend);
    set.add(PLATFORM_PERMISSIONS.userManage);
    set.add(PLATFORM_PERMISSIONS.roleRead);
    set.add(PLATFORM_PERMISSIONS.roleManage);
    set.add(PLATFORM_PERMISSIONS.roleAssign);
    set.add(PLATFORM_PERMISSIONS.productRead);
    set.add(PLATFORM_PERMISSIONS.planRead);
    set.add(PLATFORM_PERMISSIONS.subscriptionRead);
    set.add(PLATFORM_PERMISSIONS.auditRead);
    // Account/subscription summary only — no credit/invoice/payment by default.
    set.add(PLATFORM_PERMISSIONS.billingSubscriptionRead);
  }

  if (input.organizationRoles.includes("ADMIN")) {
    set.add(PLATFORM_PERMISSIONS.organizationRead);
    set.add(PLATFORM_PERMISSIONS.branchRead);
    set.add(PLATFORM_PERMISSIONS.branchManage);
    set.add(PLATFORM_PERMISSIONS.userRead);
    set.add(PLATFORM_PERMISSIONS.userInvite);
    set.add(PLATFORM_PERMISSIONS.userSuspend);
    set.add(PLATFORM_PERMISSIONS.userManage);
    set.add(PLATFORM_PERMISSIONS.roleRead);
    set.add(PLATFORM_PERMISSIONS.productRead);
    set.add(PLATFORM_PERMISSIONS.planRead);
    set.add(PLATFORM_PERMISSIONS.subscriptionRead);
    set.add(PLATFORM_PERMISSIONS.auditRead);
    // ADMIN does not receive billing permissions by default.
  }

  if (input.organizationRoles.includes("BILLING_CONTACT")) {
    set.add(PLATFORM_PERMISSIONS.organizationRead);
    set.add(PLATFORM_PERMISSIONS.subscriptionRead);
    set.add(PLATFORM_PERMISSIONS.productRead);
    set.add(PLATFORM_PERMISSIONS.planRead);
    set.add(PLATFORM_PERMISSIONS.billingAccountRead);
    set.add(PLATFORM_PERMISSIONS.billingCreditRead);
    set.add(PLATFORM_PERMISSIONS.billingInvoiceRead);
    set.add(PLATFORM_PERMISSIONS.billingPaymentRead);
    set.add(PLATFORM_PERMISSIONS.billingContactRead);
    set.add(PLATFORM_PERMISSIONS.billingContactManage);
    set.add(PLATFORM_PERMISSIONS.billingSubscriptionRead);
    // Remove prior accidental subscription.manage for BILLING_CONTACT —
    // commercial subscription lifecycle stays on OWNER/BILLING_ADMIN.
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
