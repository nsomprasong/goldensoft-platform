import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { requireSafeEnvironment } from "@/lib/env/guard";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function createPrismaClient(): PrismaClient {
  if (process.env.APP_CODE) {
    requireSafeEnvironment();
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // Allow prisma generate / build imports without opening a pool.
    return new PrismaClient();
  }

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString,
      // Never log the connection string
      max: 10,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
