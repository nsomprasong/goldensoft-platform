import type { PermissionRegistryItem } from "@/lib/permissions/registry";

export type PermissionNavigationScreen = {
  id: string;
  label: string;
  order: number;
  permissions: PermissionRegistryItem[];
};

export type PermissionNavigationGroup = {
  id: string;
  label: string;
  order: number;
  tone: "overview" | "employees" | "finance" | "settings" | "additional";
  screens: PermissionNavigationScreen[];
};

type NavigationTarget = Omit<PermissionNavigationGroup, "screens"> & {
  screenId: string;
  screenLabel: string;
  screenOrder: number;
};

const ACTION_ORDER: Record<string, number> = {
  read: 10,
  self: 10,
  create: 20,
  update: 30,
  manage: 40,
  delete: 50,
  deactivate: 50,
  approve: 60,
  reject: 70,
};

function hrNavigationTarget(item: PermissionRegistryItem): NavigationTarget | null {
  if (item.productCode !== "GOLDENSOFT_HR") return null;

  const selfService = item.action === "self";
  if (selfService) {
    if (item.menuCode === "attendance") {
      return { id: "overview", label: "งานประจำวัน", order: 1, tone: "overview", screenId: "clock-in", screenLabel: "ลงเวลา", screenOrder: 3 };
    }
    if (["leave", "overtime", "advance"].includes(item.menuCode)) {
      return { id: "overview", label: "งานประจำวัน", order: 1, tone: "overview", screenId: "my-requests", screenLabel: "เกี่ยวกับฉัน · ขออนุมัติ", screenOrder: 5 };
    }
    return { id: "overview", label: "งานประจำวัน", order: 1, tone: "overview", screenId: "my-work", screenLabel: "เกี่ยวกับฉัน", screenOrder: 4 };
  }

  const targets: Record<string, NavigationTarget> = {
    approval: { id: "overview", label: "งานประจำวัน", order: 1, tone: "overview", screenId: "approvals", screenLabel: "รายการรออนุมัติ", screenOrder: 2 },
    employee: { id: "employees", label: "พนักงาน", order: 2, tone: "employees", screenId: "employees", screenLabel: "พนักงาน", screenOrder: 1 },
    schedule: { id: "finance", label: "บัญชีและการเงิน", order: 3, tone: "finance", screenId: "schedules", screenLabel: "ตารางงาน", screenOrder: 1 },
    shift: { id: "finance", label: "บัญชีและการเงิน", order: 3, tone: "finance", screenId: "schedules", screenLabel: "ตารางงาน", screenOrder: 1 },
    calendar: { id: "finance", label: "บัญชีและการเงิน", order: 3, tone: "finance", screenId: "schedules", screenLabel: "ตารางงาน", screenOrder: 1 },
    attendance: { id: "finance", label: "บัญชีและการเงิน", order: 3, tone: "finance", screenId: "attendance", screenLabel: "เวลาทำงาน", screenOrder: 2 },
    leave: { id: "finance", label: "บัญชีและการเงิน", order: 3, tone: "finance", screenId: "leave-ot", screenLabel: "การลาและ OT", screenOrder: 3 },
    overtime: { id: "finance", label: "บัญชีและการเงิน", order: 3, tone: "finance", screenId: "leave-ot", screenLabel: "การลาและ OT", screenOrder: 3 },
    compensation: { id: "finance", label: "บัญชีและการเงิน", order: 3, tone: "finance", screenId: "payroll", screenLabel: "เงินเดือน / เบิกล่วงหน้า", screenOrder: 4 },
    payroll: { id: "finance", label: "บัญชีและการเงิน", order: 3, tone: "finance", screenId: "payroll", screenLabel: "เงินเดือน / เบิกล่วงหน้า", screenOrder: 4 },
    payslip: { id: "finance", label: "บัญชีและการเงิน", order: 3, tone: "finance", screenId: "payroll", screenLabel: "เงินเดือน / เบิกล่วงหน้า", screenOrder: 4 },
    advance: { id: "finance", label: "บัญชีและการเงิน", order: 3, tone: "finance", screenId: "payroll", screenLabel: "เงินเดือน / เบิกล่วงหน้า", screenOrder: 4 },
    payroll_schedule: { id: "finance", label: "บัญชีและการเงิน", order: 3, tone: "finance", screenId: "payroll", screenLabel: "เงินเดือน / เบิกล่วงหน้า", screenOrder: 4 },
    payroll_period: { id: "finance", label: "บัญชีและการเงิน", order: 3, tone: "finance", screenId: "payroll", screenLabel: "เงินเดือน / เบิกล่วงหน้า", screenOrder: 4 },
    report: { id: "finance", label: "บัญชีและการเงิน", order: 3, tone: "finance", screenId: "reports", screenLabel: "รายงาน", screenOrder: 5 },
  };

  if (targets[item.menuCode]) return targets[item.menuCode];

  const settingsResources = new Set(["department", "position", "employee_role", "location", "settings"]);
  if (settingsResources.has(item.menuCode)) {
    return { id: "settings", label: "ตั้งค่า", order: 4, tone: "settings", screenId: "settings", screenLabel: "ตั้งค่า", screenOrder: 1 };
  }
  return null;
}

function targetFor(item: PermissionRegistryItem): NavigationTarget {
  const hrTarget = hrNavigationTarget(item);
  if (hrTarget) return hrTarget;

  if (item.code.startsWith("platform.role.")) {
    return { id: "settings", label: "ตั้งค่า", order: 4, tone: "settings", screenId: "roles", screenLabel: "บทบาทและสิทธิ์", screenOrder: 2 };
  }

  return {
    id: "additional",
    label: "สิทธิ์ระบบเพิ่มเติม",
    order: 5,
    tone: "additional",
    screenId: `${item.productCode}:${item.menuCode}`,
    screenLabel: item.menuNameTh,
    screenOrder: 100,
  };
}

export function groupPermissionsByNavigation(
  items: PermissionRegistryItem[],
): PermissionNavigationGroup[] {
  const groups = new Map<string, PermissionNavigationGroup>();
  for (const item of items) {
    const target = targetFor(item);
    let group = groups.get(target.id);
    if (!group) {
      group = { id: target.id, label: target.label, order: target.order, tone: target.tone, screens: [] };
      groups.set(target.id, group);
    }
    let screen = group.screens.find((entry) => entry.id === target.screenId);
    if (!screen) {
      screen = { id: target.screenId, label: target.screenLabel, order: target.screenOrder, permissions: [] };
      group.screens.push(screen);
    }
    screen.permissions.push(item);
  }

  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      ...group,
      screens: group.screens
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "th"))
        .map((screen) => ({
          ...screen,
          permissions: screen.permissions.sort(
            (a, b) => (ACTION_ORDER[a.action] ?? 100) - (ACTION_ORDER[b.action] ?? 100),
          ),
        })),
    }));
}
