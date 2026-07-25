import { createHash } from "crypto";

import type { PrismaClient } from "@prisma/client";

import { MASTER } from "@/lib/platform/master-codes";
import { requireActiveMasterId } from "@/lib/platform/master-data";

export function hashRequest(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function withIdempotency<T>(
  db: PrismaClient,
  input: {
    scope: string;
    key: string;
    request: unknown;
    ttlMs?: number;
    execute: () => Promise<T>;
  },
): Promise<{ reused: boolean; result: T }> {
  const requestHash = hashRequest(input.request);
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? 24 * 60 * 60 * 1000));

  const existing = await db.idempotencyKey.findUnique({
    where: { scope_key: { scope: input.scope, key: input.key } },
    include: { status: true },
  });

  if (
    existing?.status.code === MASTER.idempotencyStatus.COMPLETED &&
    existing.responseJson != null
  ) {
    if (existing.requestHash !== requestHash) {
      throw new Error("Idempotency key reused with different payload");
    }
    return {
      reused: true,
      result: existing.responseJson as T,
    };
  }

  const inProgressId = await requireActiveMasterId(
    db,
    "idempotencyStatus",
    MASTER.idempotencyStatus.IN_PROGRESS,
  );

  if (!existing) {
    await db.idempotencyKey.create({
      data: {
        scope: input.scope,
        key: input.key,
        requestHash,
        statusId: inProgressId,
        expiresAt,
      },
    });
  }

  try {
    const result = await input.execute();
    const completedId = await requireActiveMasterId(
      db,
      "idempotencyStatus",
      MASTER.idempotencyStatus.COMPLETED,
    );
    await db.idempotencyKey.update({
      where: { scope_key: { scope: input.scope, key: input.key } },
      data: {
        statusId: completedId,
        responseJson: result as object,
        requestHash,
      },
    });
    return { reused: false, result };
  } catch (error) {
    const failedId = await requireActiveMasterId(
      db,
      "idempotencyStatus",
      MASTER.idempotencyStatus.FAILED,
    );
    await db.idempotencyKey.update({
      where: { scope_key: { scope: input.scope, key: input.key } },
      data: { statusId: failedId },
    });
    throw error;
  }
}
