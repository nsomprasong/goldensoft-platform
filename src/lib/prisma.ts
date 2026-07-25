import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import {
  buildTrustedPgSsl,
  loadSupabaseDbCaCertificate,
} from "@/lib/db/ca-certificate";
import { requireSafeEnvironment } from "@/lib/env/guard";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // Allow prisma generate / build imports without opening a pool.
    return new PrismaClient();
  }

  if (process.env.APP_CODE) {
    try {
      requireSafeEnvironment();
    } catch (error) {
      // Next production build may load incomplete .env.local before DIRECT_URL TLS is set.
      // Runtime requests and db:preflight still fail closed via the same guard.
      const building = process.env.NEXT_PHASE === "phase-production-build";
      if (!building) {
        throw error;
      }
    }
  }

  const { content } = loadSupabaseDbCaCertificate();
  const ssl = buildTrustedPgSsl(content);

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString,
      ssl,
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
