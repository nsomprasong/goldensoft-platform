import type { Prisma, PrismaClient } from "@prisma/client";

import { withIdempotency } from "@/lib/platform/idempotency";

export type BootstrapOrganizationInput = {
  customerCode: string;
  slug: string;
  legalName: string;
  displayName: string;
  timezone?: string;
  currency?: string;
  taxId?: string | null;
  ownerAuthUserId: string;
  ownerEmail: string;
  ownerDisplayName: string;
  initialBranch?: {
    code: string;
    name: string;
    timezone?: string;
  } | null;
  idempotencyKey: string;
  actorAuthUserId: string;
};

export type BootstrapOrganizationResult = {
  organizationId: string;
  branchId: string | null;
  membershipId: string;
  ownerUserProfileId: string;
};

export async function bootstrapOrganization(
  db: PrismaClient,
  input: BootstrapOrganizationInput,
): Promise<{ reused: boolean; result: BootstrapOrganizationResult }> {
  return withIdempotency(db, {
    scope: "organization.bootstrap",
    key: input.idempotencyKey,
    request: {
      customerCode: input.customerCode,
      slug: input.slug,
      ownerAuthUserId: input.ownerAuthUserId,
    },
    execute: async () => {
      return db.$transaction(async (tx) => {
        let owner = await tx.userProfile.findUnique({
          where: { authUserId: input.ownerAuthUserId },
        });

        if (!owner) {
          owner = await tx.userProfile.create({
            data: {
              authUserId: input.ownerAuthUserId,
              email: input.ownerEmail,
              displayName: input.ownerDisplayName,
              status: "ACTIVE",
            },
          });
        }

        const organization = await tx.organization.create({
          data: {
            customerCode: input.customerCode,
            slug: input.slug,
            legalName: input.legalName,
            displayName: input.displayName,
            timezone: input.timezone ?? "Asia/Bangkok",
            currency: input.currency ?? "THB",
            taxId: input.taxId ?? null,
            status: "ACTIVE",
          },
        });

        let branchId: string | null = null;
        if (input.initialBranch) {
          const branch = await tx.branch.create({
            data: {
              organizationId: organization.id,
              code: input.initialBranch.code,
              name: input.initialBranch.name,
              timezone: input.initialBranch.timezone ?? organization.timezone,
              status: "ACTIVE",
            },
          });
          branchId = branch.id;
        }

        const membership = await tx.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userProfileId: owner.id,
            status: "ACTIVE",
            joinedAt: new Date(),
            invitedByAuthUserId: input.actorAuthUserId,
          },
        });

        await tx.organizationMembershipRole.create({
          data: {
            membershipId: membership.id,
            role: "OWNER",
            status: "ACTIVE",
          },
        });

        await tx.organizationMembershipBranchScope.create({
          data: {
            membershipId: membership.id,
            scopeType: "ALL_BRANCHES",
            status: "ACTIVE",
          },
        });

        await tx.userPreference.upsert({
          where: { userProfileId: owner.id },
          create: {
            userProfileId: owner.id,
            lastOrganizationId: organization.id,
            lastBranchId: branchId,
          },
          update: {
            lastOrganizationId: organization.id,
            lastBranchId: branchId,
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId: organization.id,
            actorAuthUserId: input.actorAuthUserId,
            action: "organization.bootstrap",
            entityType: "Organization",
            entityId: organization.id,
            afterJson: {
              customerCode: organization.customerCode,
              slug: organization.slug,
              ownerAuthUserId: input.ownerAuthUserId,
              branchId,
            },
          },
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: "Organization",
            aggregateId: organization.id,
            eventType: "organization.created",
            organizationId: organization.id,
            payloadJson: {
              organizationId: organization.id,
              customerCode: organization.customerCode,
              slug: organization.slug,
              branchId,
            },
            idempotencyKey: `organization.created:${organization.id}`,
          },
        });

        return {
          organizationId: organization.id,
          branchId,
          membershipId: membership.id,
          ownerUserProfileId: owner.id,
        };
      });
    },
  });
}

export async function revokeOrganizationRole(
  db: PrismaClient,
  input: {
    membershipRoleId: string;
    actorAuthUserId: string;
  },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const role = await tx.organizationMembershipRole.findUnique({
      where: { id: input.membershipRoleId },
      include: { membership: true },
    });

    if (!role || role.status !== "ACTIVE") {
      throw new Error("Role assignment not found");
    }

    if (role.role === "OWNER") {
      const activeOwners = await tx.organizationMembershipRole.count({
        where: {
          role: "OWNER",
          status: "ACTIVE",
          membership: {
            organizationId: role.membership.organizationId,
            status: "ACTIVE",
          },
        },
      });

      if (activeOwners <= 1) {
        throw new Error("Cannot revoke the last active OWNER");
      }
    }

    await tx.organizationMembershipRole.update({
      where: { id: role.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        organizationId: role.membership.organizationId,
        actorAuthUserId: input.actorAuthUserId,
        action: "organization.role.revoke",
        entityType: "OrganizationMembershipRole",
        entityId: role.id,
        beforeJson: { role: role.role, status: role.status },
        afterJson: { role: role.role, status: "REVOKED" },
      },
    });
  });
}

export function wouldRemoveLastOwner(activeOwnerCount: number): boolean {
  return activeOwnerCount <= 1;
}

export type TxClient = Prisma.TransactionClient;
