import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import { requireActiveMasterId } from "@/lib/platform/master-data";
import type { ActorAccess } from "@/lib/platform/organizations-admin";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";

type Db = PrismaClient | Prisma.TransactionClient;

export class ProductAdminError extends Error {
  constructor(
    public readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CODE_DUPLICATE"
      | "CODE_IMMUTABLE"
      | "IN_USE"
      | "VALIDATION",
    message: string,
  ) {
    super(message);
    this.name = "ProductAdminError";
  }
}

export const createProductSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/, "รหัสผลิตภัณฑ์ไม่ถูกต้อง"),
  name: z.string().trim().min(1).max(200).optional(),
  nameTh: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  productType: z.string().trim().min(1).max(64).default("APPLICATION"),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

export const updateProductSchema = z.object({
  nameTh: z.string().trim().min(1).max(200).optional(),
  nameEn: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  productType: z.string().trim().min(1).max(64).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

function assertProductManage(
  actor: ActorAccess & { organizationRoles?: string[] },
) {
  if (actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) return;
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles ?? [],
  });
  if (!perms.includes(PLATFORM_PERMISSIONS.productManage)) {
    throw new ProductAdminError("FORBIDDEN", TH.common.forbidden);
  }
}

function assertProductRead(
  actor: ActorAccess & { organizationRoles?: string[] },
) {
  if (actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) return;
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles ?? [],
  });
  if (!perms.includes(PLATFORM_PERMISSIONS.productRead)) {
    throw new ProductAdminError("FORBIDDEN", TH.common.forbidden);
  }
}

async function ensureAuditAction(
  db: Db,
  code: string,
  nameTh: string,
  nameEn: string,
  sortOrder: number,
) {
  return db.auditActionType.upsert({
    where: { code },
    create: {
      code,
      nameTh,
      nameEn,
      sortOrder,
      isActive: true,
      isSystem: true,
    },
    update: {},
  });
}

export async function listProducts(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  options: {
    q?: string;
    statusCode?: string;
    skip?: number;
    take?: number;
  } = {},
) {
  assertProductRead(actor);
  const take = Math.min(Math.max(options.take ?? 50, 1), 100);
  const skip = Math.max(options.skip ?? 0, 0);
  const where: Prisma.ProductWhereInput = {};
  if (options.statusCode) {
    where.status = { code: options.statusCode };
  }
  if (options.q?.trim()) {
    const q = options.q.trim();
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { nameTh: { contains: q, mode: "insensitive" } },
      { nameEn: { contains: q, mode: "insensitive" } },
    ];
  }
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      include: {
        status: { select: { code: true, nameTh: true } },
        _count: { select: { plans: true, features: true, subscriptions: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      skip,
      take,
    }),
  ]);
  return { total, rows, skip, take };
}

export async function getProduct(db: PrismaClient, id: string) {
  const product = await db.product.findUnique({
    where: { id },
    include: {
      status: true,
      plans: {
        include: {
          status: { select: { code: true, nameTh: true } },
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: {
              versionNumber: true,
              priceAmount: true,
              currency: true,
              status: { select: { code: true } },
            },
          },
          _count: { select: { subscriptions: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        take: 100,
      },
      _count: { select: { plans: true, features: true, subscriptions: true } },
    },
  });
  if (!product) {
    throw new ProductAdminError("NOT_FOUND", TH.common.notFound);
  }
  return product;
}

export async function createProduct(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  raw: unknown,
) {
  assertProductManage(actor);
  const input = createProductSchema.parse(raw);
  const existing = await db.product.findUnique({ where: { code: input.code } });
  if (existing) {
    throw new ProductAdminError("CODE_DUPLICATE", "รหัสผลิตภัณฑ์นี้มีอยู่แล้ว");
  }
  const statusId = await requireActiveMasterId(
    db,
    "productStatus",
    MASTER.productStatus.ACTIVE,
  );
  const audit = await ensureAuditAction(
    db,
    MASTER.auditActionType.PRODUCT_CREATE,
    "สร้างผลิตภัณฑ์",
    "Create product",
    85,
  );
  const name = input.name?.trim() || input.nameTh;
  const product = await db.product.create({
    data: {
      code: input.code,
      name,
      nameTh: input.nameTh,
      nameEn: input.nameEn,
      description: input.description ?? null,
      productType: input.productType,
      sortOrder: input.sortOrder,
      statusId,
    },
  });
  await db.auditLog.create({
    data: {
      actorAuthUserId: actor.authUserId,
      actionTypeId: audit.id,
      entityType: "Product",
      entityId: product.id,
      afterJson: {
        code: product.code,
        nameTh: product.nameTh,
        nameEn: product.nameEn,
        productType: product.productType,
      },
    },
  });
  return product;
}

export async function updateProduct(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  id: string,
  raw: unknown,
) {
  assertProductManage(actor);
  const input = updateProductSchema.parse(raw);
  if ("code" in (raw as Record<string, unknown>)) {
    throw new ProductAdminError(
      "CODE_IMMUTABLE",
      "ไม่สามารถเปลี่ยนรหัสผลิตภัณฑ์หลังสร้างแล้ว",
    );
  }
  const existing = await db.product.findUnique({ where: { id } });
  if (!existing) {
    throw new ProductAdminError("NOT_FOUND", TH.common.notFound);
  }
  const audit = await ensureAuditAction(
    db,
    MASTER.auditActionType.PRODUCT_UPDATE,
    "แก้ไขผลิตภัณฑ์",
    "Update product",
    86,
  );
  const nameTh = input.nameTh ?? existing.nameTh ?? existing.name;
  const nameEn = input.nameEn ?? existing.nameEn ?? existing.name;
  const product = await db.product.update({
    where: { id },
    data: {
      nameTh,
      nameEn,
      name: nameTh,
      description:
        input.description === undefined
          ? existing.description
          : input.description,
      productType: input.productType ?? existing.productType,
      sortOrder: input.sortOrder ?? existing.sortOrder,
    },
  });
  await db.auditLog.create({
    data: {
      actorAuthUserId: actor.authUserId,
      actionTypeId: audit.id,
      entityType: "Product",
      entityId: product.id,
      beforeJson: {
        nameTh: existing.nameTh,
        nameEn: existing.nameEn,
        productType: existing.productType,
        sortOrder: existing.sortOrder,
      },
      afterJson: {
        nameTh: product.nameTh,
        nameEn: product.nameEn,
        productType: product.productType,
        sortOrder: product.sortOrder,
      },
    },
  });
  return product;
}

export async function setProductStatus(
  db: PrismaClient,
  actor: ActorAccess & { organizationRoles?: string[] },
  id: string,
  statusCode: string,
) {
  assertProductManage(actor);
  if (
    statusCode !== MASTER.productStatus.ACTIVE &&
    statusCode !== MASTER.productStatus.RETIRED
  ) {
    throw new ProductAdminError("VALIDATION", "สถานะผลิตภัณฑ์ไม่ถูกต้อง");
  }
  const existing = await db.product.findUnique({
    where: { id },
    include: { status: true },
  });
  if (!existing) {
    throw new ProductAdminError("NOT_FOUND", TH.common.notFound);
  }
  const statusId = await requireActiveMasterId(db, "productStatus", statusCode);
  const auditCode =
    statusCode === MASTER.productStatus.ACTIVE
      ? "product.activate"
      : "product.deactivate";
  const audit = await ensureAuditAction(
    db,
    auditCode,
    statusCode === MASTER.productStatus.ACTIVE
      ? "เปิดใช้งานผลิตภัณฑ์"
      : "ปิดใช้งานผลิตภัณฑ์",
    statusCode === MASTER.productStatus.ACTIVE
      ? "Activate product"
      : "Deactivate product",
    statusCode === MASTER.productStatus.ACTIVE ? 100 : 101,
  );
  const product = await db.product.update({
    where: { id },
    data: { statusId },
  });
  await db.auditLog.create({
    data: {
      actorAuthUserId: actor.authUserId,
      actionTypeId: audit.id,
      entityType: "Product",
      entityId: product.id,
      beforeJson: { status: existing.status.code },
      afterJson: { status: statusCode },
    },
  });
  return product;
}
