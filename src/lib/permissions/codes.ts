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
  roleAssign: "platform.role.assign",
  auditRead: "platform.audit.read",
  subscriptionRead: "platform.subscription.read",
  subscriptionManage: "platform.subscription.manage",
  productRead: "platform.product.read",
  settingsRead: "platform.settings.read",
} as const;

export type PlatformPermission =
  (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

/** Thai labels for permission matrix UI. */
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
  [PLATFORM_PERMISSIONS.roleAssign]: "กำหนดบทบาท",
  [PLATFORM_PERMISSIONS.auditRead]: "ดูบันทึกกิจกรรม",
  [PLATFORM_PERMISSIONS.subscriptionRead]: "ดูการสมัครใช้บริการ",
  [PLATFORM_PERMISSIONS.subscriptionManage]: "จัดการการสมัครใช้บริการ",
  [PLATFORM_PERMISSIONS.productRead]: "ดูผลิตภัณฑ์",
  [PLATFORM_PERMISSIONS.settingsRead]: "ดูการตั้งค่าระบบ",
};

export function permissionsForRoles(input: {
  platformRoles: string[];
  organizationRoles: string[];
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
    set.add(PLATFORM_PERMISSIONS.auditRead);
  }
  if (input.platformRoles.includes("SUPPORT")) {
    set.add(PLATFORM_PERMISSIONS.organizationRead);
    set.add(PLATFORM_PERMISSIONS.branchRead);
    set.add(PLATFORM_PERMISSIONS.userRead);
    set.add(PLATFORM_PERMISSIONS.productRead);
    set.add(PLATFORM_PERMISSIONS.subscriptionRead);
    set.add(PLATFORM_PERMISSIONS.auditRead);
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
    set.add(PLATFORM_PERMISSIONS.roleAssign);
    set.add(PLATFORM_PERMISSIONS.productRead);
    set.add(PLATFORM_PERMISSIONS.subscriptionRead);
    set.add(PLATFORM_PERMISSIONS.auditRead);
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
    set.add(PLATFORM_PERMISSIONS.subscriptionRead);
    set.add(PLATFORM_PERMISSIONS.auditRead);
  }

  if (input.organizationRoles.includes("BILLING_CONTACT")) {
    set.add(PLATFORM_PERMISSIONS.organizationRead);
    set.add(PLATFORM_PERMISSIONS.subscriptionRead);
    set.add(PLATFORM_PERMISSIONS.subscriptionManage);
    set.add(PLATFORM_PERMISSIONS.productRead);
  }

  return [...set].sort();
}

export function hasPermissionCode(
  permissions: string[],
  permission: PlatformPermission,
): boolean {
  return permissions.includes(permission);
}
