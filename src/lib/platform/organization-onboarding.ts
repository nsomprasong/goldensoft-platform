import type { Prisma, PrismaClient } from "@prisma/client";

import type { ActorAccess } from "@/lib/platform/organizations-admin";
import { generateEntitlementsForSubscription } from "@/lib/platform/entitlements";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";

export class OnboardingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OnboardingError";
  }
}

export type OnboardingPayload = {
  organization: {
    customerCode: string;
    slug: string;
    displayName: string;
    legalName: string;
    taxId?: string | null;
    nameEn?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  primaryBranch: {
    code: string;
    name: string;
    nameEn?: string | null;
    address?: string | null;
  };
  owner: {
    email: string;
    displayName: string;
    /** Existing auth user id when owner already exists. */
    authUserId?: string | null;
  };
  productCode: string;
  planCode: string;
  subscriptionMode: "TRIAL" | "ACTIVE";
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function onboardOrganization(
  db: PrismaClient,
  input: {
    actor: ActorAccess;
    actorAuthUserId: string;
    idempotencyKey: string;
    payload: OnboardingPayload;
  },
) {
  if (!input.actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) {
    throw new OnboardingError("FORBIDDEN", "เฉพาะ SUPER_ADMIN เท่านั้น");
  }

  const existing = await db.organizationOnboarding.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing?.organizationId && existing.resultJson) {
    return existing;
  }

  const completedStatus = await db.organizationOnboardingStatus.findUnique({
    where: { code: MASTER.onboardingStatus.COMPLETED },
  });
  const inProgressStatus = await db.organizationOnboardingStatus.findUnique({
    where: { code: MASTER.onboardingStatus.IN_PROGRESS },
  });
  const failedStatus = await db.organizationOnboardingStatus.findUnique({
    where: { code: MASTER.onboardingStatus.FAILED },
  });
  if (!completedStatus || !inProgressStatus || !failedStatus) {
    throw new OnboardingError(
      "ONBOARDING_STATUS_MISSING",
      "ยังไม่ได้เตรียมสถานะ onboarding (รอ migration)",
    );
  }

  const draft =
    existing ??
    (await db.organizationOnboarding.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        statusId: inProgressStatus.id,
        createdByAuthUserId: input.actorAuthUserId,
        payloadJson: input.payload as unknown as Prisma.InputJsonValue,
      },
    }));

  try {
    const result = await db.$transaction(async (tx) => {
      const orgStatus = await tx.organizationStatus.findUniqueOrThrow({
        where: { code: MASTER.organizationStatus.ACTIVE },
      });
      const branchStatus = await tx.branchStatus.findUniqueOrThrow({
        where: { code: MASTER.branchStatus.ACTIVE },
      });
      const membershipStatus = await tx.membershipStatus.findUniqueOrThrow({
        where: { code: MASTER.membershipStatus.ACTIVE },
      });
      const assignmentStatus = await tx.assignmentStatus.findUniqueOrThrow({
        where: { code: MASTER.assignmentStatus.ACTIVE },
      });
      const ownerRole = await tx.organizationRole.findFirstOrThrow({
        where: {
          code: MASTER.organizationRole.OWNER,
          organizationId: null,
          isSystem: true,
        },
      });
      const allBranches = await tx.branchScopeType.findUniqueOrThrow({
        where: { code: MASTER.branchScopeType.ALL_BRANCHES },
      });
      const product = await tx.product.findUnique({
        where: { code: input.payload.productCode },
      });
      if (!product) {
        throw new OnboardingError("PRODUCT_NOT_FOUND", "ไม่พบผลิตภัณฑ์");
      }
      const plan = await tx.plan.findFirst({
        where: {
          productId: product.id,
          code: input.payload.planCode,
        },
        include: {
          versions: {
            where: {
              status: { code: MASTER.planVersionStatus.PUBLISHED },
            },
            orderBy: { versionNumber: "desc" },
            take: 1,
            include: {
              features: {
                include: { feature: true },
              },
            },
          },
        },
      });
      const planVersion = plan?.versions[0];
      if (!plan || !planVersion) {
        throw new OnboardingError("PLAN_NOT_FOUND", "ไม่พบแพ็กเกจที่เผยแพร่แล้ว");
      }

      const org = await tx.organization.create({
        data: {
          customerCode: input.payload.organization.customerCode.trim(),
          slug: input.payload.organization.slug.trim().toLowerCase(),
          displayName: input.payload.organization.displayName.trim(),
          legalName: input.payload.organization.legalName.trim(),
          taxId: input.payload.organization.taxId?.trim() || null,
          nameEn: input.payload.organization.nameEn?.trim() || null,
          email: input.payload.organization.email?.trim() || null,
          phone: input.payload.organization.phone?.trim() || null,
          statusId: orgStatus.id,
        },
      });

      const branch = await tx.branch.create({
        data: {
          organizationId: org.id,
          code: input.payload.primaryBranch.code.trim().toUpperCase(),
          name: input.payload.primaryBranch.name.trim(),
          nameEn: input.payload.primaryBranch.nameEn?.trim() || null,
          address: input.payload.primaryBranch.address?.trim() || null,
          statusId: branchStatus.id,
          isPrimary: true,
        },
      });

      let ownerProfileId: string | null = null;
      let invitationId: string | null = null;
      const ownerEmail = normalizeEmail(input.payload.owner.email);

      if (input.payload.owner.authUserId) {
        const profile = await tx.userProfile.findUnique({
          where: { authUserId: input.payload.owner.authUserId },
        });
        if (!profile) {
          throw new OnboardingError(
            "OWNER_PROFILE_MISSING",
            "ไม่พบโปรไฟล์ของเจ้าขององค์กร",
          );
        }
        ownerProfileId = profile.id;
        const membership = await tx.organizationMembership.create({
          data: {
            organizationId: org.id,
            userProfileId: profile.id,
            statusId: membershipStatus.id,
            joinedAt: new Date(),
            invitedByAuthUserId: input.actorAuthUserId,
          },
        });
        await tx.organizationMembershipRole.create({
          data: {
            membershipId: membership.id,
            roleId: ownerRole.id,
            statusId: assignmentStatus.id,
          },
        });
        await tx.organizationMembershipBranchScope.create({
          data: {
            membershipId: membership.id,
            scopeTypeId: allBranches.id,
            statusId: assignmentStatus.id,
          },
        });
      } else {
        const inviteStatus = await tx.userInvitationStatus.findUniqueOrThrow({
          where: { code: MASTER.userInvitationStatus.PENDING },
        });
        const inviter = await tx.userProfile.findUnique({
          where: { authUserId: input.actorAuthUserId },
          select: { id: true },
        });
        if (!inviter) {
          throw new OnboardingError(
            "ACTOR_PROFILE_MISSING",
            "ไม่พบโปรไฟล์ผู้สร้าง",
          );
        }
        const invitation = await tx.userInvitation.create({
          data: {
            emailNormalized: ownerEmail,
            displayName: input.payload.owner.displayName.trim(),
            organizationId: org.id,
            organizationRoleId: ownerRole.id,
            branchScopeTypeId: allBranches.id,
            branchIdsJson: [],
            statusId: inviteStatus.id,
            invitedByProfileId: inviter.id,
            idempotencyKey: `onboard-owner:${input.idempotencyKey}`,
          },
        });
        invitationId = invitation.id;
      }

      const subscriptionStatusCode =
        input.payload.subscriptionMode === "TRIAL"
          ? MASTER.subscriptionStatus.TRIAL
          : MASTER.subscriptionStatus.ACTIVE;
      const subscriptionStatus = await tx.subscriptionStatus.findUniqueOrThrow({
        where: { code: subscriptionStatusCode },
      });

      const snapshotFeatures = planVersion.features.map((row) => ({
        code: row.feature.code,
        name: row.feature.name,
        limitValue: row.limitValue,
      }));
      const snapshotJson = {
        planVersion: planVersion.versionNumber,
        featureCodes: snapshotFeatures.map((f) => f.code),
        features: snapshotFeatures,
        demoPricing: true,
      };

      const trialDays = planVersion.trialDays ?? 14;
      const startsAt = new Date();
      const trialEndsAt =
        input.payload.subscriptionMode === "TRIAL"
          ? new Date(startsAt.getTime() + trialDays * 24 * 60 * 60 * 1000)
          : null;

      const subscription = await tx.subscription.create({
        data: {
          organizationId: org.id,
          productId: product.id,
          planId: plan.id,
          planVersionId: planVersion.id,
          statusId: subscriptionStatus.id,
          billingCycleId: planVersion.billingCycleDefaultId,
          planCode: plan.code,
          planVersionNumber: planVersion.versionNumber,
          priceAmount: planVersion.priceAmount,
          currency: planVersion.currency,
          snapshotJson,
          startsAt,
          trialEndsAt,
        },
      });

      await generateEntitlementsForSubscription(tx, subscription.id);

      const action = await tx.auditActionType.upsert({
        where: { code: MASTER.auditActionType.ORGANIZATION_ONBOARD },
        create: {
          code: MASTER.auditActionType.ORGANIZATION_ONBOARD,
          nameTh: "เริ่มใช้งานองค์กรใหม่",
          nameEn: "Onboard organization",
          sortOrder: 95,
          isActive: true,
          isSystem: true,
        },
        update: {},
      });
      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          actorAuthUserId: input.actorAuthUserId,
          actionTypeId: action.id,
          entityType: "organization",
          entityId: org.id,
          afterJson: {
            branchId: branch.id,
            subscriptionId: subscription.id,
            ownerProfileId,
            invitationId,
            productCode: product.code,
            planCode: plan.code,
          },
        },
      });

      return {
        organizationId: org.id,
        branchId: branch.id,
        subscriptionId: subscription.id,
        ownerProfileId,
        invitationId,
      };
    });

    return db.organizationOnboarding.update({
      where: { id: draft.id },
      data: {
        organizationId: result.organizationId,
        statusId: completedStatus.id,
        resultJson: result,
        lastErrorCode: null,
      },
    });
  } catch (error) {
    const code =
      error instanceof OnboardingError ? error.code : "ONBOARDING_FAILED";
    await db.organizationOnboarding.update({
      where: { id: draft.id },
      data: {
        statusId: failedStatus.id,
        lastErrorCode: code,
      },
    });
    throw error;
  }
}

export function assertCanReadPlans(actor: ActorAccess) {
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: [],
  });
  return (
    perms.includes(PLATFORM_PERMISSIONS.planRead) ||
    perms.includes(PLATFORM_PERMISSIONS.productRead)
  );
}
