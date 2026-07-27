import type { Prisma, PrismaClient } from "@prisma/client";

import { ensureAuditActionType } from "@/lib/platform/audit";
import {
  allocateUniqueOrganizationSlug,
  canCreateOrganization,
  type ActorAccess,
} from "@/lib/platform/organizations-admin";
import { createStaffOrganizationAssignment } from "@/lib/platform/customer-portfolio";
import { generateEntitlementsForSubscription } from "@/lib/platform/entitlements";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import {
  composeStaffDisplayName,
  type IndividualCustomerIdentity,
} from "@/lib/platform/staff-identity";

export class OnboardingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OnboardingError";
  }
}

export type OrganizationEntityType =
  (typeof MASTER.organizationEntityType)[keyof typeof MASTER.organizationEntityType];

export type OnboardingPayload = {
  organization: {
    customerCode: string;
    entityType: OrganizationEntityType;
    /** Optional — server generates from customerCode when omitted. */
    slug?: string | null;
    /** Required for LEGAL_ENTITY; derived from person for INDIVIDUAL. */
    displayName?: string | null;
    /** Optional — defaults to displayName when omitted. */
    legalName?: string | null;
    taxId?: string | null;
    nameEn?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    /** Required when entityType is INDIVIDUAL (tax invoice identity). */
    person?: IndividualCustomerIdentity | null;
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
  /** One plan per selected product — creates a subscription for each. */
  selections: Array<{ productCode: string; planCode: string }>;
  subscriptionMode: "TRIAL" | "ACTIVE";
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isStaffPortfolioCreator(actor: ActorAccess): boolean {
  if (actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN)) {
    return false;
  }
  return (
    actor.platformRoles.includes(MASTER.platformRole.SALES) ||
    actor.platformRoles.includes(MASTER.platformRole.ACCOUNT_MANAGER)
  );
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
  if (!canCreateOrganization(input.actor)) {
    throw new OnboardingError(
      "FORBIDDEN",
      "ไม่มีสิทธิ์สร้างองค์กรลูกค้า",
    );
  }

  const autoBindPortfolio = isStaffPortfolioCreator(input.actor);
  const contactRoleCode = autoBindPortfolio
    ? MASTER.organizationRole.ADMIN
    : MASTER.organizationRole.OWNER;

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
    const selections = input.payload.selections ?? [];
    if (selections.length === 0) {
      throw new OnboardingError(
        "SELECTION_REQUIRED",
        "กรุณาเลือกอย่างน้อยหนึ่งผลิตภัณฑ์และแพ็กเกจ",
      );
    }
    const seenProducts = new Set<string>();
    for (const row of selections) {
      const code = row.productCode.trim();
      if (seenProducts.has(code)) {
        throw new OnboardingError(
          "DUPLICATE_PRODUCT",
          `เลือกผลิตภัณฑ์ซ้ำ: ${code}`,
        );
      }
      seenProducts.add(code);
    }

    // Resolve lookups + audit types outside the interactive transaction so
    // Supabase/pooler does not drop the tx mid-flight (P2028).
    await Promise.all([
      ensureAuditActionType(db, MASTER.auditActionType.ORGANIZATION_ONBOARD),
      ensureAuditActionType(db, MASTER.auditActionType.ENTITLEMENT_GENERATE),
      ensureAuditActionType(db, MASTER.auditActionType.STAFF_PORTFOLIO_ASSIGN),
    ]);

    const [
      orgStatus,
      branchStatus,
      membershipStatus,
      assignmentStatus,
      contactRole,
      allBranches,
      inviteStatus,
    ] = await Promise.all([
      db.organizationStatus.findUniqueOrThrow({
        where: { code: MASTER.organizationStatus.ACTIVE },
      }),
      db.branchStatus.findUniqueOrThrow({
        where: { code: MASTER.branchStatus.ACTIVE },
      }),
      db.membershipStatus.findUniqueOrThrow({
        where: { code: MASTER.membershipStatus.ACTIVE },
      }),
      db.assignmentStatus.findUniqueOrThrow({
        where: { code: MASTER.assignmentStatus.ACTIVE },
      }),
      db.organizationRole.findFirstOrThrow({
        where: {
          code: contactRoleCode,
          organizationId: null,
          isSystem: true,
        },
      }),
      db.branchScopeType.findUniqueOrThrow({
        where: { code: MASTER.branchScopeType.ALL_BRANCHES },
      }),
      db.userInvitationStatus.findUniqueOrThrow({
        where: { code: MASTER.userInvitationStatus.PENDING },
      }),
    ]);

    const resolvedSelections: Array<{
      product: { id: string; code: string };
      plan: { id: string; code: string };
      planVersion: {
        id: string;
        versionNumber: number;
        trialDays: number | null;
        billingCycleDefaultId: string;
        priceAmount: Prisma.Decimal;
        currency: string;
        features: Array<{
          limitValue: string | null;
          feature: { code: string; name: string };
        }>;
      };
    }> = [];
    for (const selection of selections) {
      const product = await db.product.findUnique({
        where: { code: selection.productCode.trim() },
      });
      if (!product) {
        throw new OnboardingError(
          "PRODUCT_NOT_FOUND",
          `ไม่พบผลิตภัณฑ์ ${selection.productCode}`,
        );
      }
      const plan = await db.plan.findFirst({
        where: {
          productId: product.id,
          code: selection.planCode.trim(),
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
        throw new OnboardingError(
          "PLAN_NOT_FOUND",
          `ไม่พบแพ็กเกจที่เผยแพร่แล้วสำหรับ ${selection.productCode}`,
        );
      }
      resolvedSelections.push({ product, plan, planVersion });
    }

    const onboardActionTypeId = await ensureAuditActionType(
      db,
      MASTER.auditActionType.ORGANIZATION_ONBOARD,
    );

    const result = await db.$transaction(
      async (tx) => {
      const customerCode = input.payload.organization.customerCode.trim();
      const entityType =
        input.payload.organization.entityType ??
        MASTER.organizationEntityType.LEGAL_ENTITY;
      const person = input.payload.organization.person ?? null;
      const isIndividual =
        entityType === MASTER.organizationEntityType.INDIVIDUAL;

      // TEMP: individual tax-payer identity may be omitted for onboarding tests.
      const personDisplayName =
        isIndividual && person
          ? composeStaffDisplayName(person).trim()
          : "";
      const displayName = isIndividual
        ? personDisplayName || customerCode
        : (input.payload.organization.displayName?.trim() ?? "");
      if (!displayName || displayName.length < 2) {
        throw new OnboardingError(
          "DISPLAY_NAME_REQUIRED",
          "กรุณากรอกชื่อที่แสดง",
        );
      }

      const legalName =
        input.payload.organization.legalName?.trim() || displayName;
      const taxId = isIndividual
        ? (person?.nationalId ?? null)
        : input.payload.organization.taxId?.trim() || null;
      const phone = isIndividual
        ? (person?.phone ?? null)
        : input.payload.organization.phone?.trim() || null;
      const address = isIndividual
        ? (person?.addressLine ?? null)
        : input.payload.organization.address?.trim() || null;
      const slug =
        input.payload.organization.slug?.trim().toLowerCase() ||
        (await allocateUniqueOrganizationSlug(tx, customerCode));

      const org = await tx.organization.create({
        data: {
          customerCode,
          slug,
          entityType,
          displayName,
          legalName,
          taxId,
          nameEn: isIndividual
            ? null
            : input.payload.organization.nameEn?.trim() || null,
          email: input.payload.organization.email?.trim() || null,
          phone,
          address,
          titleCode: isIndividual ? (person?.titleCode ?? null) : null,
          firstNameTh: isIndividual ? (person?.firstNameTh ?? null) : null,
          lastNameTh: isIndividual ? (person?.lastNameTh ?? null) : null,
          nationalId: isIndividual ? (person?.nationalId ?? null) : null,
          dateOfBirth:
            isIndividual && person?.dateOfBirth
              ? new Date(`${person.dateOfBirth}T00:00:00.000Z`)
              : null,
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
      let portfolioAssignmentId: string | null = null;
      const ownerEmail = normalizeEmail(input.payload.owner.email);

      const creatorProfile = await tx.userProfile.findUnique({
        where: { authUserId: input.actorAuthUserId },
        select: { id: true },
      });
      if (!creatorProfile) {
        throw new OnboardingError(
          "ACTOR_PROFILE_MISSING",
          "ไม่พบโปรไฟล์ผู้สร้าง",
        );
      }

      if (autoBindPortfolio) {
        const assignment = await createStaffOrganizationAssignment(tx, {
          staffUserProfileId: creatorProfile.id,
          organizationId: org.id,
          assignedByAuthUserId: input.actorAuthUserId,
          note: "ผูกอัตโนมัติเมื่อพนักงานขายสร้างองค์กรลูกค้า",
          autoAssigned: true,
        });
        portfolioAssignmentId = assignment.id;
      }

      if (input.payload.owner.authUserId) {
        const profile = await tx.userProfile.findUnique({
          where: { authUserId: input.payload.owner.authUserId },
        });
        if (!profile) {
          throw new OnboardingError(
            "OWNER_PROFILE_MISSING",
            "ไม่พบโปรไฟล์ของผู้ดูแลองค์กร",
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
            roleId: contactRole.id,
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
        const invitation = await tx.userInvitation.create({
          data: {
            emailNormalized: ownerEmail,
            displayName: input.payload.owner.displayName.trim(),
            organizationId: org.id,
            organizationRoleId: contactRole.id,
            branchScopeTypeId: allBranches.id,
            branchIdsJson: [],
            statusId: inviteStatus.id,
            invitedByProfileId: creatorProfile.id,
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

      const startsAt = new Date();
      const subscriptionIds: string[] = [];
      const selectionSummary: Array<{
        productCode: string;
        planCode: string;
        subscriptionId: string;
      }> = [];

      for (const resolved of resolvedSelections) {
        const { product, plan, planVersion } = resolved;
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
        subscriptionIds.push(subscription.id);
        selectionSummary.push({
          productCode: product.code,
          planCode: plan.code,
          subscriptionId: subscription.id,
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          actorAuthUserId: input.actorAuthUserId,
          actionTypeId: onboardActionTypeId,
          entityType: "organization",
          entityId: org.id,
          afterJson: {
            branchId: branch.id,
            subscriptionIds,
            subscriptionId: subscriptionIds[0] ?? null,
            ownerProfileId,
            invitationId,
            portfolioAssignmentId,
            contactRoleCode,
            selections: selectionSummary,
          },
        },
      });

      return {
        organizationId: org.id,
        branchId: branch.id,
        subscriptionIds,
        subscriptionId: subscriptionIds[0] ?? null,
        ownerProfileId,
        invitationId,
        portfolioAssignmentId,
        contactRoleCode,
        selections: selectionSummary,
      };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );

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
