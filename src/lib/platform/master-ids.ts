import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { MASTER } from "@/lib/platform/master-codes";
import { prisma } from "@/lib/prisma";

type Db = PrismaClient | Prisma.TransactionClient;

type ActiveStatusIds = {
  assignmentActiveId: string;
  membershipActiveId: string;
  branchActiveId: string | null;
};

const activeStatusCache: {
  assignmentActiveId?: string;
  membershipActiveId?: string;
  branchActiveId?: string | null;
  ready?: boolean;
} = {};
let activeStatusInFlight: Promise<ActiveStatusIds | null> | null = null;

/**
 * Master status rows are immutable after seed. Cache IDs process-wide so every
 * request does not pay three remote round-trips before loading the user.
 */
export async function getActiveStatusIds(
  db: Db = prisma,
): Promise<ActiveStatusIds | null> {
  if (
    activeStatusCache.ready &&
    activeStatusCache.assignmentActiveId &&
    activeStatusCache.membershipActiveId
  ) {
    return {
      assignmentActiveId: activeStatusCache.assignmentActiveId,
      membershipActiveId: activeStatusCache.membershipActiveId,
      branchActiveId: activeStatusCache.branchActiveId ?? null,
    };
  }

  if (!activeStatusInFlight) {
    activeStatusInFlight = (async () => {
      const [assignmentActive, membershipActive, branchActive] =
        await Promise.all([
          db.assignmentStatus.findUnique({
            where: { code: MASTER.assignmentStatus.ACTIVE },
            select: { id: true },
          }),
          db.membershipStatus.findUnique({
            where: { code: MASTER.membershipStatus.ACTIVE },
            select: { id: true },
          }),
          db.branchStatus.findUnique({
            where: { code: MASTER.branchStatus.ACTIVE },
            select: { id: true },
          }),
        ]);

      if (!assignmentActive || !membershipActive) {
        return null;
      }

      activeStatusCache.assignmentActiveId = assignmentActive.id;
      activeStatusCache.membershipActiveId = membershipActive.id;
      activeStatusCache.branchActiveId = branchActive?.id ?? null;
      activeStatusCache.ready = true;

      return {
        assignmentActiveId: assignmentActive.id,
        membershipActiveId: membershipActive.id,
        branchActiveId: branchActive?.id ?? null,
      };
    })().finally(() => {
      activeStatusInFlight = null;
    });
  }

  return activeStatusInFlight;
}
