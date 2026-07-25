import type { PrismaClient } from "@prisma/client";

/** System organization roles are global (organizationId null). */
export async function findSystemOrganizationRole(
  db: Pick<PrismaClient, "organizationRole">,
  code: string,
) {
  return db.organizationRole.findFirst({
    where: { code, organizationId: null, isSystem: true },
  });
}
