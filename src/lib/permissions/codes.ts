export const PLATFORM_PERMISSIONS = {
  organizationRead: "platform.organization.read",
  organizationManage: "platform.organization.manage",
  subscriptionRead: "platform.subscription.read",
  subscriptionManage: "platform.subscription.manage",
  productRead: "platform.product.read",
} as const;

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
  }
  if (input.platformRoles.includes("SUPPORT")) {
    set.add(PLATFORM_PERMISSIONS.organizationRead);
    set.add(PLATFORM_PERMISSIONS.productRead);
    set.add(PLATFORM_PERMISSIONS.subscriptionRead);
  }

  if (
    input.organizationRoles.includes("OWNER") ||
    input.organizationRoles.includes("ADMIN")
  ) {
    set.add(PLATFORM_PERMISSIONS.organizationRead);
    set.add(PLATFORM_PERMISSIONS.organizationManage);
    set.add(PLATFORM_PERMISSIONS.productRead);
    set.add(PLATFORM_PERMISSIONS.subscriptionRead);
  }
  if (input.organizationRoles.includes("BILLING_CONTACT")) {
    set.add(PLATFORM_PERMISSIONS.organizationRead);
    set.add(PLATFORM_PERMISSIONS.subscriptionRead);
    set.add(PLATFORM_PERMISSIONS.subscriptionManage);
    set.add(PLATFORM_PERMISSIONS.productRead);
  }

  return [...set].sort();
}
