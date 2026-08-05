import type { PrismaClient } from "@prisma/client";

export type PermissionRegistryItem = {
  code: string;
  scopeCode: "PLATFORM" | "ORGANIZATION" | "BOTH";
  productCode: string;
  featureCode: string | null;
  menuCode: string;
  menuNameTh: string;
  categoryTh: string;
  action: string;
  actionNameTh: string;
  descriptionTh: string | null;
};

const ACTION_NAMES: Record<string, string> = {
  read: "ดูข้อมูล",
  create: "เพิ่มข้อมูล",
  update: "แก้ไขข้อมูล",
  delete: "ลบข้อมูล",
  manage: "จัดการ",
  approve: "อนุมัติ",
  export: "ส่งออกข้อมูล",
  invite: "เชิญผู้ใช้งาน",
  reset_password: "รีเซ็ตรหัสผ่าน",
  configure: "ตั้งค่าระบบ",
};

/** DB-backed registry. New active Permission rows appear in the role editor automatically. */
export async function loadPermissionRegistry(
  db: PrismaClient,
  options: { organizationId?: string | null; platform?: boolean } = {},
): Promise<PermissionRegistryItem[]> {
  const entitledProducts = options.organizationId
    ? await db.entitlement.findMany({
        where: {
          organizationId: options.organizationId,
          status: { code: "ACTIVE" },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
        select: { product: { select: { code: true } } },
        distinct: ["productId"],
      })
    : [];
  const productCodes = new Set(entitledProducts.map((row) => row.product.code));
  const rows = await db.permission.findMany({
    where: {
      isActive: true,
      ...(options.platform
        ? {}
        : productCodes.size > 0
          ? {
              productCode: { in: ["PLATFORM", ...productCodes] },
            }
          : {
              productCode: "PLATFORM",
            }),
    },
    include: { permissionAction: true },
    orderBy: [{ productCode: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
  });

  return rows
    .filter((row) => {
      const expected = options.platform ? "PLATFORM" : "ORGANIZATION";
      return row.scopeCode === expected || row.scopeCode === "BOTH";
    })
    .map((row) => ({
    code: row.code,
    scopeCode: row.scopeCode as PermissionRegistryItem["scopeCode"],
    productCode: row.productCode,
    featureCode: row.featureCode,
    menuCode: row.menuCode ?? row.resource,
    menuNameTh: row.menuNameTh ?? row.nameTh,
    categoryTh: row.menuCategoryTh ?? (row.productCode === "PLATFORM" ? "ระบบแพลตฟอร์ม" : "ระบบบุคคล"),
    action: row.action,
    actionNameTh: row.permissionAction?.nameTh ?? ACTION_NAMES[row.action] ?? row.nameTh,
    descriptionTh: row.descriptionTh,
    }));
}
