import { PrismaClient } from "@prisma/client";

import { requireSafeEnvironment } from "@/lib/env/guard";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // Skip hard fail during `next build` page collection when env is injected by CI later.
  if (process.env.APP_CODE) {
    requireSafeEnvironment();
  }
  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
