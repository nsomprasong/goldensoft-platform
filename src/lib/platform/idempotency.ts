import { createHash } from "crypto";

import type { PrismaClient } from "@prisma/client";

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
  });

  if (existing?.status === "COMPLETED" && existing.responseJson) {
    if (existing.requestHash !== requestHash) {
      throw new Error("Idempotency key reused with different payload");
    }
    return {
      reused: true,
      result: JSON.parse(existing.responseJson) as T,
    };
  }

  if (!existing) {
    await db.idempotencyKey.create({
      data: {
        scope: input.scope,
        key: input.key,
        requestHash,
        status: "IN_PROGRESS",
        expiresAt,
      },
    });
  }

  try {
    const result = await input.execute();
    await db.idempotencyKey.update({
      where: { scope_key: { scope: input.scope, key: input.key } },
      data: {
        status: "COMPLETED",
        responseJson: JSON.stringify(result),
        requestHash,
      },
    });
    return { reused: false, result };
  } catch (error) {
    await db.idempotencyKey.update({
      where: { scope_key: { scope: input.scope, key: input.key } },
      data: { status: "FAILED" },
    });
    throw error;
  }
}
