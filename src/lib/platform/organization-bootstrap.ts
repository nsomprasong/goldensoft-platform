import type { Prisma, PrismaClient } from "@prisma/client";

import { withIdempotency } from "@/lib/platform/idempotency";
import { MASTER } from "@/lib/platform/master-codes";
import { requireActiveMasterId } from "@/lib/platform/master-data";

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
        const [
          userActiveId,
          orgActiveId,
          branchActiveId,
          membershipActiveId,
          ownerRoleId,
          assignmentActiveId,
          allBranchesScopeId,
          auditActionId,
          outboxPendingId,
        ] = await Promise.all([
          requireActiveMasterId(tx, "userProfileStatus", MASTER.userProfileStatus.ACTIVE),
          requireActiveMasterId(tx, "organizationStatus", MASTER.organizationStatus.ACTIVE),
          requireActiveMasterId(tx, "branchStatus", MASTER.branchStatus.ACTIVE),
          requireActiveMasterId(tx, "membershipStatus", MASTER.membershipStatus.ACTIVE),
          requireActiveMasterId(tx, "organizationRole", MASTER.organizationRole.OWNER),
          requireActiveMasterId(tx, "assignmentStatus", MASTER.assignmentStatus.ACTIVE),
          requireActiveMasterId(tx, "branchScopeType", MASTER.branchScopeType.ALL_BRANCHES),
          requireActiveMasterId(
            tx,
            "auditActionType",
            MASTER.auditActionType.ORGANIZATION_BOOTSTRAP,
          ),
          requireActiveMasterId(tx, "outboxEventStatus", MASTER.outboxEventStatus.PENDING),
        ]);

        let owner = await tx.userProfile.findUnique({
          where: { authUserId: input.ownerAuthUserId },
        });

        if (!owner) {
          owner = await tx.userProfile.create({
            data: {
              authUserId: input.ownerAuthUserId,
              email: input.ownerEmail,
              displayName: input.ownerDisplayName,
              statusId: userActiveId,
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
            statusId: orgActiveId,
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
              statusId: branchActiveId,
            },
          });
          branchId = branch.id;
        }

        const membership = await tx.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userProfileId: owner.id,
            statusId: membershipActiveId,
            joinedAt: new Date(),
            invitedByAuthUserId: input.actorAuthUserId,
          },
        });

        await tx.organizationMembershipRole.create({
          data: {
            membershipId: membership.id,
            roleId: ownerRoleId,
            statusId: assignmentActiveId,
          },
        });

        await tx.organizationMembershipBranchScope.create({
          data: {
            membershipId: membership.id,
            scopeTypeId: allBranchesScopeId,
            statusId: assignmentActiveId,
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
            actionTypeId: auditActionId,
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
            statusId: outboxPendingId,
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
      include: {
        membership: true,
        role: true,
        status: true,
      },
    });

    if (!role || role.status.code !== MASTER.assignmentStatus.ACTIVE) {
      throw new Error("Role assignment not found");
    }

    if (role.role.code === MASTER.organizationRole.OWNER) {
      const ownerRole = await tx.organizationRole.findFirst({
        where: {
          code: MASTER.organizationRole.OWNER,
          organizationId: null,
          isSystem: true,
        },
      });
      const activeStatus = await tx.assignmentStatus.findUnique({
        where: { code: MASTER.assignmentStatus.ACTIVE },
      });
      const membershipActive = await tx.membershipStatus.findUnique({
        where: { code: MASTER.membershipStatus.ACTIVE },
      });
      if (!ownerRole || !activeStatus || !membershipActive) {
        throw new Error("Master data incomplete");
      }

      const activeOwners = await tx.organizationMembershipRole.count({
        where: {
          roleId: ownerRole.id,
          statusId: activeStatus.id,
          membership: {
            organizationId: role.membership.organizationId,
            statusId: membershipActive.id,
          },
        },
      });

      if (wouldRemoveLastOwner(activeOwners)) {
        throw new Error("Cannot revoke the last active OWNER");
      }
    }

    const revokedStatusId = await requireActiveMasterId(
      tx,
      "assignmentStatus",
      MASTER.assignmentStatus.REVOKED,
    );
    const auditActionId = await requireActiveMasterId(
      tx,
      "auditActionType",
      MASTER.auditActionType.ORGANIZATION_ROLE_REVOKE,
    );

    await tx.organizationMembershipRole.update({
      where: { id: role.id },
      data: { statusId: revokedStatusId, revokedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        organizationId: role.membership.organizationId,
        actorAuthUserId: input.actorAuthUserId,
        actionTypeId: auditActionId,
        entityType: "OrganizationMembershipRole",
        entityId: role.id,
        beforeJson: { role: role.role.code, status: role.status.code },
        afterJson: { role: role.role.code, status: MASTER.assignmentStatus.REVOKED },
      },
    });
  });
}

export function wouldRemoveLastOwner(activeOwnerCount: number): boolean {
  return activeOwnerCount <= 1;
}

export type TxClient = Prisma.TransactionClient;
