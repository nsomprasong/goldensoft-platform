import { prisma } from "../src/lib/prisma";
import { ensureBillingAccount } from "../src/lib/billing/accounts";

async function main() {
  const organization = await prisma.organization.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } });
  if (!organization) throw new Error("Create an organization before seeding billing demo data.");
  await ensureBillingAccount(prisma, { organizationId: organization.id, actorAuthUserId: null });
  console.log(`Billing account ensured for ${organization.displayName}`);
}
main().finally(() => prisma.$disconnect());
