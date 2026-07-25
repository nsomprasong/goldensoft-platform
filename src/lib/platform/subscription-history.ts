import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export const SUBSCRIPTION_HISTORY_CHANGE = {
  CREATE: "CREATE",
  ACTIVATE: "ACTIVATE",
  TRIAL: "TRIAL",
  SUSPEND: "SUSPEND",
  RESUME: "RESUME",
  CANCEL: "CANCEL",
  EXPIRE: "EXPIRE",
  CHANGE_PLAN: "CHANGE_PLAN",
  EXTEND: "EXTEND",
} as const;

export type SubscriptionHistoryChangeCode =
  (typeof SUBSCRIPTION_HISTORY_CHANGE)[keyof typeof SUBSCRIPTION_HISTORY_CHANGE];

export async function recordSubscriptionHistory(
  db: Db,
  input: {
    subscriptionId: string;
    organizationId: string;
    changeTypeCode: SubscriptionHistoryChangeCode;
    fromStatusCode?: string | null;
    toStatusCode?: string | null;
    fromPlanCode?: string | null;
    toPlanCode?: string | null;
    fromPlanVersionNumber?: number | null;
    toPlanVersionNumber?: number | null;
    snapshotJson?: Prisma.InputJsonValue;
    reason?: string | null;
    actorAuthUserId?: string | null;
  },
) {
  const changeType = await db.subscriptionChangeType.upsert({
    where: { code: input.changeTypeCode },
    create: {
      code: input.changeTypeCode,
      nameTh: input.changeTypeCode,
      nameEn: input.changeTypeCode,
      isActive: true,
      isSystem: true,
      sortOrder: 0,
    },
    update: {},
  });

  return db.subscriptionHistory.create({
    data: {
      subscriptionId: input.subscriptionId,
      organizationId: input.organizationId,
      changeTypeId: changeType.id,
      fromStatusCode: input.fromStatusCode ?? null,
      toStatusCode: input.toStatusCode ?? null,
      fromPlanCode: input.fromPlanCode ?? null,
      toPlanCode: input.toPlanCode ?? null,
      fromPlanVersionNumber: input.fromPlanVersionNumber ?? null,
      toPlanVersionNumber: input.toPlanVersionNumber ?? null,
      snapshotJson: input.snapshotJson ?? {},
      reason: input.reason ?? null,
      actorAuthUserId: input.actorAuthUserId ?? null,
    },
  });
}

export async function listSubscriptionHistories(
  db: PrismaClient,
  subscriptionId: string,
  options: { take?: number; skip?: number } = {},
) {
  const take = Math.min(Math.max(options.take ?? 50, 1), 100);
  const skip = Math.max(options.skip ?? 0, 0);
  const [total, rows] = await Promise.all([
    db.subscriptionHistory.count({ where: { subscriptionId } }),
    db.subscriptionHistory.findMany({
      where: { subscriptionId },
      include: {
        changeType: { select: { code: true, nameTh: true, nameEn: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);
  return { total, rows, skip, take };
}
