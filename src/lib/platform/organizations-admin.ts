import { z } from "zod";

import type { Prisma, PrismaClient } from "@prisma/client";

import { TH } from "@/lib/i18n/th";
import { writeAuditLog } from "@/lib/platform/audit";
import { MASTER } from "@/lib/platform/master-codes";
import { requireActiveMasterId } from "@/lib/platform/master-data";

export class OrganizationAdminError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CODE_IMMUTABLE"
    | "CODE_DUPLICATE"
    | "SUSPEND_WARNING"
    | "VALIDATION";

  constructor(code: OrganizationAdminError["code"], message: string) {
    super(message);
    this.name = "OrganizationAdminError";
    this.code = code;
  }
}

export const createOrganizationSchema = z.object({
  customerCode: z.string().trim().min(2).max(64),
  slug: z.string().trim().min(2).max(64).regex(/^[a-z0-9-]+$/),
  displayName: z.string().trim().min(1).max(200),
  legalName: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  taxId: z.string().trim().max(32).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
});

export const updateOrganizationSchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  legalName: z.string().trim().min(1).max(200).optional(),
  nameEn: z.string().trim().max(200).optional().nullable(),
  taxId: z.string().trim().max(32).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  customerCode: z.string().optional(),
});

export type ActorAccess = {
  authUserId: string;
  platformRoles: string[];
  membershipOrganizationIds: string[];
};

export function canManageOrganization(
  actor: ActorAccess,
  organizationId: string,
): boolean {
  if (actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) return true;
  return actor.membershipOrganizationIds.includes(organizationId);
}

export function canCreateOrganization(actor: ActorAccess): boolean {
  return actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
}

export function canListAllOrganizations(actor: ActorAccess): boolean {
  return (
    actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) ||
    actor.platformRoles.includes(MASTER.platformRole.SUPPORT)
  );
}

export async function listOrganizationsForActor(
  db: PrismaClient,
  actor: ActorAccess,
  filters: {
    q?: string;
    statusCode?: string;
    skip?: number;
    take?: number;
  } = {},
) {
  const where: Prisma.OrganizationWhereInput = { deletedAt: null };
  if (!canListAllOrganizations(actor)) {
    where.id = { in: actor.membershipOrganizationIds };
  }
  if (filters.statusCode) {
    where.status = { code: filters.statusCode };
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { displayName: { contains: q, mode: "insensitive" } },
      { customerCode: { contains: q, mode: "insensitive" } },
      { legalName: { contains: q, mode: "insensitive" } },
      // nameEn search requires migration 0002 — omit until applied
    ];
  }

  const take = Math.min(filters.take ?? 20, 100);
  const skip = filters.skip ?? 0;
  const [total, rows] = await Promise.all([
    db.organization.count({ where }),
    db.organization.findMany({
      where,
      select: {
        id: true,
        customerCode: true,
        slug: true,
        displayName: true,
        legalName: true,
        taxId: true,
        timezone: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        statusId: true,
        status: { select: { id: true, code: true, nameTh: true, nameEn: true } },
        _count: {
          select: {
            branches: { where: { deletedAt: null } },
            memberships: true,
            subscriptions: true,
          },
        },
      },
      orderBy: { displayName: "asc" },
      skip,
      take,
    }),
  ]);

  return { total, rows, skip, take };
}

export async function createOrganization(
  db: PrismaClient,
  actor: ActorAccess,
  input: z.infer<typeof createOrganizationSchema>,
) {
  if (!canCreateOrganization(actor)) {
    throw new OrganizationAdminError("FORBIDDEN", TH.common.forbidden);
  }
  const parsed = createOrganizationSchema.parse(input);

  try {
    return await db.$transaction(async (tx) => {
      const statusId = await requireActiveMasterId(
        tx,
        "organizationStatus",
        MASTER.organizationStatus.ACTIVE,
      );
      const created = await tx.organization.create({
        data: {
          customerCode: parsed.customerCode,
          slug: parsed.slug,
          displayName: parsed.displayName,
          legalName: parsed.legalName,
          taxId: parsed.taxId ?? null,
          // nameEn/email/phone/address require migration 0002
          statusId,
        },
      });
      await writeAuditLog(tx, {
        organizationId: created.id,
        actorAuthUserId: actor.authUserId,
        actionCode: MASTER.auditActionType.ORGANIZATION_CREATE,
        entityType: "Organization",
        entityId: created.id,
        after: {
          customerCode: created.customerCode,
          displayName: created.displayName,
        },
      });
      return created;
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new OrganizationAdminError(
        "CODE_DUPLICATE",
        "รหัสองค์กรหรือ slug ซ้ำ",
      );
    }
    throw error;
  }
}

export async function updateOrganization(
  db: PrismaClient,
  actor: ActorAccess,
  organizationId: string,
  input: z.infer<typeof updateOrganizationSchema>,
) {
  if (!canManageOrganization(actor, organizationId)) {
    throw new OrganizationAdminError("FORBIDDEN", TH.common.forbidden);
  }
  const parsed = updateOrganizationSchema.parse(input);
  if (parsed.customerCode !== undefined) {
    throw new OrganizationAdminError("CODE_IMMUTABLE", TH.org.codeImmutable);
  }

  const existing = await db.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: { id: true, displayName: true, legalName: true },
  });
  if (!existing) {
    throw new OrganizationAdminError("NOT_FOUND", TH.common.notFound);
  }

  return db.$transaction(async (tx) => {
    const updated = await tx.organization.update({
      where: { id: organizationId },
      data: {
        displayName: parsed.displayName,
        legalName: parsed.legalName,
        taxId: parsed.taxId,
        // nameEn/email/phone/address require migration 0002
      },
      select: { id: true, displayName: true, legalName: true },
    });
    await writeAuditLog(tx, {
      organizationId,
      actorAuthUserId: actor.authUserId,
      actionCode: MASTER.auditActionType.ORGANIZATION_UPDATE,
      entityType: "Organization",
      entityId: organizationId,
      before: {
        displayName: existing.displayName,
        legalName: existing.legalName,
      },
      after: {
        displayName: updated.displayName,
        legalName: updated.legalName,
      },
    });
    return updated;
  });
}

export async function suspendOrganization(
  db: PrismaClient,
  actor: ActorAccess,
  organizationId: string,
  options: { force?: boolean } = {},
) {
  if (!actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) {
    throw new OrganizationAdminError("FORBIDDEN", TH.common.forbidden);
  }

  const existing = await db.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: {
      id: true,
      status: { select: { code: true } },
      _count: {
        select: {
          memberships: true,
          subscriptions: true,
        },
      },
    },
  });
  if (!existing) {
    throw new OrganizationAdminError("NOT_FOUND", TH.common.notFound);
  }

  if (
    !options.force &&
    (existing._count.memberships > 0 || existing._count.subscriptions > 0)
  ) {
    throw new OrganizationAdminError("SUSPEND_WARNING", TH.org.suspendWarning);
  }

  return db.$transaction(async (tx) => {
    const statusId = await requireActiveMasterId(
      tx,
      "organizationStatus",
      MASTER.organizationStatus.SUSPENDED,
    );
    const updated = await tx.organization.update({
      where: { id: organizationId },
      data: { statusId },
      select: { id: true },
    });
    await writeAuditLog(tx, {
      organizationId,
      actorAuthUserId: actor.authUserId,
      actionCode: MASTER.auditActionType.ORGANIZATION_SUSPEND,
      entityType: "Organization",
      entityId: organizationId,
      before: { status: existing.status.code },
      after: { status: MASTER.organizationStatus.SUSPENDED },
    });
    return updated;
  });
}
